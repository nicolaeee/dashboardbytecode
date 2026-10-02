import { describe, expect, it, vi } from 'vitest';
import { fetchTeacherRegistry } from './registryData';
import { computePayslipTotals, computePayslipTable } from './registryCalc';
import type { TrackerAttendance, TrackerLesson } from './types';

function lesson(overrides: Partial<TrackerLesson>): TrackerLesson {
  return {
    id: 'l1', teacher_id: 'bogdan', taught_by: 'david', group_id: 'g-andrei', session_number: 1,
    curriculum_index: 1, lesson_date: '2026-09-01', lesson_time: '10:00', format: 'individual',
    is_taught: true, homework_note: null, created_at: '2026-09-01T00:00:00Z', ...overrides,
  };
}

function present(lessonId: string, taughtBy: string): TrackerAttendance {
  return {
    id: `a-${lessonId}`, teacher_id: 'bogdan', taught_by: taughtBy, lesson_id: lessonId, student_id: 'andrei',
    status: 'present', star_count: 2, recovery_date: null, recovery_time: null, recovery_group_id: null,
    updated_at: '2026-09-01T00:00:00Z',
  };
}

describe('fetchTeacherRegistry', () => {
  it('cere registrul dupa profesorul care a predat (get_teacher_registry), nu dupa proprietarul clasei', async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: { lessons: [lesson({})], attendance: [present('l1', 'david')], students: [{ id: 'andrei', name: 'Andrei' }], groups: null },
      error: null,
    }));
    const result = await fetchTeacherRegistry({ rpc }, 'david');
    expect(rpc).toHaveBeenCalledWith('get_teacher_registry', { p_teacher_id: 'david' });
    expect(result.lessons).toHaveLength(1);
    expect(result.groups).toEqual([]);
  });

  it('arunca eroarea in loc sa intoarca un registru gol (nu ascundem pierderi de date)', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
    await expect(fetchTeacherRegistry({ rpc }, 'david')).rejects.toThrow('boom');
  });
});

describe('Payslip dupa transferul clasei (Andrei: David -> Bogdan)', () => {
  // Ambele lectii au teacher_id = bogdan (proprietarul curent dupa transfer); conteaza taught_by.
  const before = lesson({ id: 'l1', taught_by: 'david', lesson_date: '2026-09-01' });
  const after = lesson({ id: 'l2', taught_by: 'bogdan', lesson_date: '2026-09-20', session_number: 2 });

  it('lectia tinuta de David ramane in registrul lui David, cea noua apare la Bogdan', () => {
    // Exact ce intoarce get_teacher_registry pentru fiecare profesor (filtrat pe taught_by).
    const david = computePayslipTotals(computePayslipTable([before], [present('l1', 'david')], [], 2026));
    const bogdan = computePayslipTotals(computePayslipTable([after], [present('l2', 'bogdan')], [], 2026));
    expect(david.individual).toBe(1);
    expect(bogdan.individual).toBe(1);
  });
});
