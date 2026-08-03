import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, makeFakeSupabase, okResult } from '@/test/supabaseFake';

vi.mock('@/lib/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/makeup-notification-alerts', { method: 'POST', body: JSON.stringify(body) });
}

/** Un elev cu o recuperare in asteptare, gata pentru "Trimite Notificare"/"Programat". */
function baseStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'Ion Popescu', short_name: 'Ionuț',
    parent_phones: ['0712345678'], parent_emails: ['parinte@test.ro'], group_id: 'g1',
    pending_makeups: 1, makeup_notification_count: 0, last_makeup_notification: null, is_scheduled: false,
    ...overrides,
  };
}

// 15 ianuarie 2026 - iarna, Bucuresti = UTC+2 fara ambiguitate de ora de vara.
const DAYTIME_UTC = new Date(Date.UTC(2026, 0, 15, 10, 0, 0)); // 12:00 Bucuresti - normal
const QUIET_LATE_UTC = new Date(Date.UTC(2026, 0, 15, 19, 0, 0)); // 21:00 Bucuresti - liniste
const QUIET_EARLY_UTC = new Date(Date.UTC(2026, 0, 15, 4, 0, 0)); // 06:00 Bucuresti - liniste

describe('/api/makeup-notification-alerts (cooldown, ore de liniste, "Programat")', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(DAYTIME_UTC);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('notify_parent in afara orelor de liniste, fara cooldown activ -> trimite EXACT payload-ul asteptat', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({
      id: 'teacher-mk-a', full_name: 'Prof Test', phone: '0700000000', makeup_calendar_link: 'https://cal.example.com/prof',
    }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent()),
      tracker_groups: okResult({ group_name: 'M1 Luni la 18:00' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const res = await POST(request({ studentId: 's1', action: 'notify_parent' }));
    const json = await res.json();

    expect(json.ok).toBe(true);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'notify_parent',
      studentName: 'Ionuț',
      studentFullName: 'Ion Popescu',
      className: 'M1 Luni la 18:00',
      parentPhones: '0712345678',
      parentEmails: 'parinte@test.ro',
      teacherName: 'Prof Test',
      teacherPhone: '0700000000',
      calendarLink: 'https://cal.example.com/prof',
      notificationStep: 1, // count-ul curent (0) + 1
    });
  });

  it('SECURITATE (audit M-6): notify_parent in orele de liniste (20:00-8:00) e respins server-side, fara sa cheme webhook-ul', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-b' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({ tracker_students: okResult(baseStudent()) }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    vi.setSystemTime(QUIET_LATE_UTC);
    let res = await POST(request({ studentId: 's1', action: 'notify_parent' }));
    expect(res.status).toBe(400);

    vi.setSystemTime(QUIET_EARLY_UTC);
    res = await POST(request({ studentId: 's1', action: 'notify_parent' }));
    expect(res.status).toBe(400);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('SECURITATE: cooldown-ul de 48h e reverificat server-side (nu doar client-side)', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-c' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent({ makeup_notification_count: 1, last_makeup_notification: new Date(DAYTIME_UTC.getTime() - 60 * 60 * 1000).toISOString() })), // acum 1h
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's1', action: 'notify_parent' }));

    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a 4-a notificare (peste maximul de 3) e respinsa', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-d' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent({ makeup_notification_count: 3, last_makeup_notification: new Date(0).toISOString() })),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's1', action: 'notify_parent' }));

    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('"makeup_scheduled" functioneaza INDIFERENT de ora (nu se supune orelor de liniste)', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-e' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent()),
      tracker_groups: okResult({ group_name: 'Clasa Y' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    vi.setSystemTime(QUIET_LATE_UTC); // ora de liniste - nu conteaza pentru "Programat"
    const res = await POST(request({ studentId: 's1', action: 'makeup_scheduled' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true, is_scheduled: true });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.action).toBe('makeup_scheduled');
    expect(sent.notificationStep).toBe(0); // nu s-a incrementat contorul de notificari catre parinte
  });

  it('"makeup_scheduled" e idempotent: daca e deja is_scheduled=true, nu retrimite alerta', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-f' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent({ is_scheduled: true })),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's1', action: 'makeup_scheduled' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true, is_scheduled: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un elev fara nicio recuperare in asteptare (pending_makeups = 0) e respins', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-g' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(baseStudent({ pending_makeups: 0 })),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's1', action: 'notify_parent' }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('respinge o valoare de "action" in afara celor doua permise', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-mk-h' }));
    const res = await POST(request({ studentId: 's1', action: 'ceva-fabricat' }));
    expect(res.status).toBe(400);
  });
});
