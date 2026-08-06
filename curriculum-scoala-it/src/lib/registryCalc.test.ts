import { describe, expect, it } from 'vitest';
import { computeMonthEntries, computePayslipTable, computePayslipTotals } from './registryCalc';
import type { TrackerAttendance, TrackerLesson } from './types';

const students = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Bogdan' },
  { id: 's3', name: 'Cezar' },
];

function lesson(overrides: Partial<TrackerLesson>): TrackerLesson {
  return {
    id: 'l1', teacher_id: 't1', group_id: 'g1', session_number: 1, curriculum_index: 1,
    lesson_date: '2026-01-10', lesson_time: '10:00', format: 'individual', is_taught: true,
    homework_note: null, created_at: '2026-01-01T00:00:00Z', ...overrides,
  };
}

function attendanceRow(overrides: Partial<TrackerAttendance>): TrackerAttendance {
  return {
    id: 'a1', teacher_id: 't1', lesson_id: 'l1', student_id: 's1', status: 'absent',
    star_count: 0, recovery_date: null, recovery_time: null, recovery_group_id: null,
    updated_at: '2026-01-01T00:00:00Z', ...overrides,
  };
}

describe('computePayslipTable - regula unicitatii (fara dublari)', () => {
  it('lectie individuala 100% absenta, recuperata ulterior: NUMAI 1 ora (recuperare), nu 2', () => {
    const lessons = [lesson({ id: 'l1', format: 'individual', lesson_date: '2026-01-10' })];
    // Absenta initiala marcata, apoi recuperata (aceeasi linie, is_taught devine true in app -
    // dar ramane irelevant aici, testam direct pe attendance/lessons brute din DB).
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-01-17' }),
    ];
    const table = computePayslipTable(lessons, attendance, students, 2026);
    const totals = computePayslipTotals(table);
    expect(totals).toEqual({ grup: 0, individual: 0, recuperare: 1 });
    expect(table[0]).toEqual({ grup: 0, individual: 0, recuperare: 1 }); // Ianuarie
  });

  it('lectie individuala cu elevul PREZENT live: 1 ora "individual", fara recuperare', () => {
    const lessons = [lesson({ id: 'l1', format: 'individual', lesson_date: '2026-01-10' })];
    const attendance = [attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'present' })];
    const totals = computePayslipTotals(computePayslipTable(lessons, attendance, students, 2026));
    expect(totals).toEqual({ grup: 0, individual: 1, recuperare: 0 });
  });

  it('lectie de grup 100% absenta, recuperata individual de fiecare elev separat: fiecare recuperare conteaza distinct, lectia originala NU conteaza', () => {
    const lessons = [lesson({ id: 'l1', format: 'grup', lesson_date: '2026-02-05' })];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-02-10' }),
      attendanceRow({ id: 'a2', lesson_id: 'l1', student_id: 's2', status: 'made_up', recovery_date: '2026-02-12' }),
    ];
    const totals = computePayslipTotals(computePayslipTable(lessons, attendance, students, 2026));
    expect(totals).toEqual({ grup: 0, individual: 0, recuperare: 2 });
  });

  it('recuperare de GRUP (recovery_group_id comun): 1 singura ora, indiferent de cati elevi participa', () => {
    const lessons = [lesson({ id: 'l1', format: 'grup', lesson_date: '2026-02-05' })];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-02-10', recovery_group_id: 'rg1' }),
      attendanceRow({ id: 'a2', lesson_id: 'l1', student_id: 's2', status: 'made_up', recovery_date: '2026-02-10', recovery_group_id: 'rg1' }),
      attendanceRow({ id: 'a3', lesson_id: 'l1', student_id: 's3', status: 'made_up', recovery_date: '2026-02-10', recovery_group_id: 'rg1' }),
    ];
    const totals = computePayslipTotals(computePayslipTable(lessons, attendance, students, 2026));
    expect(totals).toEqual({ grup: 0, individual: 0, recuperare: 1 });
  });

  it('lectie de grup cu unii prezenti live si altii absenti recuperati separat: sedinta live conteaza o data + fiecare recuperare separat (evenimente reale distincte)', () => {
    const lessons = [lesson({ id: 'l1', format: 'grup', lesson_date: '2026-03-01' })];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'present' }),
      attendanceRow({ id: 'a2', lesson_id: 'l1', student_id: 's2', status: 'made_up', recovery_date: '2026-03-08' }),
    ];
    const totals = computePayslipTotals(computePayslipTable(lessons, attendance, students, 2026));
    expect(totals).toEqual({ grup: 1, individual: 0, recuperare: 1 });
  });

  it('lectie 100% absenta, neinca recuperata: 0 ore in registru', () => {
    const lessons = [lesson({ id: 'l1', format: 'individual', lesson_date: '2026-01-10' })];
    const attendance = [attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'absent' })];
    const totals = computePayslipTotals(computePayslipTable(lessons, attendance, students, 2026));
    expect(totals).toEqual({ grup: 0, individual: 0, recuperare: 0 });
  });

  it('recuperarea se numara in luna datei de recuperare, nu in luna lectiei originale', () => {
    const lessons = [lesson({ id: 'l1', format: 'individual', lesson_date: '2026-01-30' })];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-02-03' }),
    ];
    const table = computePayslipTable(lessons, attendance, students, 2026);
    expect(table[0]).toEqual({ grup: 0, individual: 0, recuperare: 0 }); // Ianuarie
    expect(table[1]).toEqual({ grup: 0, individual: 0, recuperare: 1 }); // Februarie
  });
});

describe('computeMonthEntries', () => {
  it('exclude lectiile fara nicio sedinta live si nu dubleaza recuperarea', () => {
    const lessons = [lesson({ id: 'l1', format: 'individual', lesson_date: '2026-01-10', session_number: 3 })];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-01-17', recovery_time: '09:00' }),
    ];
    const entries = computeMonthEntries(lessons, attendance, students, 2026, 0);
    expect(entries).toEqual([{ date: '2026-01-17', time: '09:00', kind: 'recuperare', groupStudentNames: undefined }]);
  });

  it('recuperarea de grup produce o singura intrare cu numele tuturor participantilor', () => {
    const lessons: TrackerLesson[] = [];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-01-17', recovery_group_id: 'rg1' }),
      attendanceRow({ id: 'a2', lesson_id: 'l1', student_id: 's2', status: 'made_up', recovery_date: '2026-01-17', recovery_group_id: 'rg1' }),
    ];
    const entries = computeMonthEntries(lessons, attendance, students, 2026, 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].groupStudentNames).toEqual(['Ana', 'Bogdan']);
  });
});
