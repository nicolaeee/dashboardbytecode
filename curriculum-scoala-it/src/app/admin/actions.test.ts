import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResult, makeFakeSupabase, okResult } from '@/test/supabaseFake';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
// createClass nu foloseste createAdminClient, dar admin/actions.ts il importa la nivel de
// modul (pentru alte functii) - iar el importa la randul lui pachetul special 'server-only'
// (rezolvat normal doar de bundler-ul Next.js, nu si de Node/Vitest) - stub simplu, ca
// modulul sa se poata incarca in test.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
// revalidatePath se bazeaza pe context-ul intern de request al Next.js, inexistent intr-un
// test unitar - il inlocuim cu un no-op, exact ca in ghidul oficial de testare Next.js.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { createClass } from './actions';

describe('createClass (audit R-1: rollback la esec partial)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('SECURITATE: un non-admin primeste EXACT mesajul cerut, fara nicio scriere', async () => {
    const fakeSupabase = makeFakeSupabase(
      { profiles: okResult({ role: 'teacher' }) },
      { authUserId: 'user-not-admin-1' }
    );
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);

    const result = await createClass({
      teacherId: 't1', groupName: 'Clasa Test', moduleCount: 1, rewardType: 'stars',
      dayOfWeek: 'luni', timeOfDay: null, course: null, studentNames: ['Elev 1'],
    });

    expect(result).toEqual({ ok: false, error: 'Doar administratorii au permisiunea de a crea clase.' });
    // Niciun insert nu trebuie sa fi avut loc pe tracker_groups.
    expect(fakeSupabase.from).not.toHaveBeenCalledWith('tracker_groups');
  });

  it('creeaza clasa + elevii cu succes pentru un admin', async () => {
    const fakeSupabase = makeFakeSupabase(
      {
        profiles: okResult({ role: 'admin', id: 'teacher-target-1' }),
        tracker_groups: okResult({ id: 'group-1', teacher_id: 'teacher-target-1', group_name: 'Clasa Test' }),
        tracker_students: okResult([{ id: 'stud-1', name: 'Elev 1' }, { id: 'stud-2', name: 'Elev 2' }]),
      },
      { authUserId: 'admin-1' }
    );
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);

    const result = await createClass({
      teacherId: 'teacher-target-1', groupName: 'Clasa Test', moduleCount: 1, rewardType: 'stars',
      dayOfWeek: 'luni', timeOfDay: '18:00', course: null, studentNames: ['Elev 1', 'Elev 2'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.group).toEqual({ id: 'group-1', teacher_id: 'teacher-target-1', group_name: 'Clasa Test' });
      expect(result.students).toHaveLength(2);
    }
  });

  it('REGRESIE (audit R-1): daca inserarea elevilor esueaza, clasa creata anterior e stearsa (rollback), nu ramane orfana', async () => {
    const fakeSupabase = makeFakeSupabase(
      {
        profiles: okResult({ role: 'admin', id: 'teacher-target-2' }),
        tracker_groups: okResult({ id: 'group-orphan-risk', teacher_id: 'teacher-target-2', group_name: 'Clasa Test 2' }),
        tracker_students: errorResult('eroare simulata la inserarea elevilor'),
      },
      { authUserId: 'admin-2' }
    );
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);

    const result = await createClass({
      teacherId: 'teacher-target-2', groupName: 'Clasa Test 2', moduleCount: 1, rewardType: 'stars',
      dayOfWeek: 'luni', timeOfDay: null, course: null, studentNames: ['Elev 1'],
    });

    expect(result).toEqual({ ok: false, error: 'eroare simulata la inserarea elevilor' });
    // Cheia testului: tracker_groups trebuie interogat de 2 ori - o data pentru insert,
    // a doua oara pentru delete-ul de rollback. Inainte de fix, era interogat o singura
    // data (insert), iar clasa ramanea orfana in DB.
    const groupCalls = vi.mocked(fakeSupabase.from).mock.calls.filter(([table]) => table === 'tracker_groups');
    expect(groupCalls).toHaveLength(2);
  });

  it('respinge o clasa fara niciun elev, fara sa ajunga macar la insert', async () => {
    const fakeSupabase = makeFakeSupabase(
      { profiles: okResult({ role: 'admin' }) },
      { authUserId: 'admin-3' }
    );
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never);

    const result = await createClass({
      teacherId: 'teacher-target-3', groupName: 'Clasa Fara Elevi', moduleCount: 1, rewardType: 'stars',
      dayOfWeek: null, timeOfDay: null, course: null, studentNames: ['   ', ''],
    });

    expect(result).toEqual({ ok: false, error: 'Adaugă cel puțin un elev.' });
    expect(fakeSupabase.from).not.toHaveBeenCalledWith('tracker_groups');
  });
});
