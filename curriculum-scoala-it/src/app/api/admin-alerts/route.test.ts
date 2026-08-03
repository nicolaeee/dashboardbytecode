import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, makeFakeSupabase, okResult } from '@/test/supabaseFake';

vi.mock('@/lib/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/admin-alerts', { method: 'POST', body: JSON.stringify(body) });
}

describe('/api/admin-alerts (audit M-2: date recitite din DB, nu din client)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('trimite EXACT payload-ul asteptat, cu teacherName = contul autentificat (nu cel din body)', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-m2-a', full_name: 'Ana Popescu' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult({ id: 's1', name: 'Ion Popescu', short_name: 'Ionuț', parent_phones: ['0712345678'], group_id: 'g1' }),
      tracker_groups: okResult({ group_name: 'M1 Luni la 18:00' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const res = await POST(request({ studentId: 's1', status: 'conectat' }));
    const json = await res.json();

    expect(json).toEqual({ ok: true });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      studentName: 'Ion Popescu',
      teacherName: 'Ana Popescu',
      className: 'M1 Luni la 18:00',
      status: 'conectat',
      parentPhones: '+0712345678',
    });
  });

  it('SECURITATE (audit M-2 / spoofing): un status in afara listei permise e respins, fara sa cheme webhook-ul', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-m2-b' }));
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 's1', status: 'ceva-fabricat' }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('SECURITATE (audit M-2 / IDOR): un elev care nu apartine profesorului (RLS) -> 404', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-m2-c' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult(null),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await POST(request({ studentId: 'elev-strain', status: 'neconectat' }));

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un elev fara telefon de parinte trimite totusi alerta, cu "Lipsă număr"', async () => {
    vi.mocked(requireUser).mockResolvedValue(fakeProfile({ id: 'teacher-m2-d' }));
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase({
      tracker_students: okResult({ id: 's4', name: 'Elev X', short_name: null, parent_phones: [], group_id: 'g1' }),
      tracker_groups: okResult({ group_name: 'Clasa X' }),
    }) as never);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await POST(request({ studentId: 's4', status: 'neconectat' }));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).parentPhones).toBe('Lipsă număr');
  });
});
