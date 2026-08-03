import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, makeFakeSupabase, okResult } from '@/test/supabaseFake';

vi.mock('@/lib/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/connection-link-alerts', { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/connection-link-alerts (audit H-1: webhook mutat server-side)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('trimite catre webhook EXACT payload-ul asteptat, cu aceleasi chei ca inainte de refactor', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-h1-a' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult({
        id: 's1', name: 'Ion Popescu', short_name: 'Ionuț',
        parent_phones: ['0712345678'], parent_emails: ['parinte@test.ro'], group_id: 'g1',
      }),
      tracker_groups: okResult({ meet_link: 'https://meet.google.com/xyz' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const res = await POST(request({ studentId: 's1' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('connect.pabbly.com');
    expect(JSON.parse(init.body as string)).toEqual({
      nume_copil: 'Ionuț',
      studentFullName: 'Ion Popescu',
      telefon: '0712345678@c.us',
      email: 'parinte@test.ro',
      link_conectare: 'https://meet.google.com/xyz',
    });
  });

  it('foloseste numele complet daca elevul nu are short_name', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-h1-b' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult({
        id: 's2', name: 'Maria Ionescu', short_name: null,
        parent_phones: ['+40712345678'], parent_emails: [], group_id: 'g1',
      }),
      tracker_groups: okResult({ meet_link: null }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await POST(request({ studentId: 's2' }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.nume_copil).toBe('Maria Ionescu');
    expect(sent.telefon).toBe('+40712345678@c.us'); // "+" ramane, sufixul "@c.us" se adauga oricum
    expect(sent.link_conectare).toBe('');
  });

  it('SECURITATE (audit M-2 / IDOR): elev inexistent sau care nu apartine profesorului -> 404, fara sa cheme webhook-ul', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-h1-c' }));
    // RLS ar intoarce 0 randuri pentru un elev care nu e al profesorului - simulam exact asta.
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(null),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 'elev-strain' }));

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('elev fara niciun telefon de parinte -> eroare clara, fara sa cheme webhook-ul', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-h1-d' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult({ id: 's3', name: 'Elev Fara Telefon', short_name: null, parent_phones: [], parent_emails: [], group_id: 'g1' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's3' }));
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('respinge un body fara studentId', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-h1-e' }));
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });
});
