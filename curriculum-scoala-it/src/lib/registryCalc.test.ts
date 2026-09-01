import { describe, expect, it } from 'vitest';
import { computeGroupSessionRanks, computeMonthEntries, computePayslipTable, computePayslipTotals } from './registryCalc';
import type { TrackerAttendance, TrackerLesson } from './types';

const students = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Bogdan' },
  { id: 's3', name: 'Cezar' },
];

const groups = [{ id: 'g1', group_name: 'M1 Joi la 11:00' }];

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
    const entries = computeMonthEntries(lessons, attendance, students, groups, 2026, 0);
    expect(entries).toEqual([{ date: '2026-01-17', time: '09:00', kind: 'recuperare', groupName: 'M1 Joi la 11:00', groupStudentNames: undefined }]);
  });

  it('recuperarea de grup produce o singura intrare cu numele tuturor participantilor', () => {
    const lessons: TrackerLesson[] = [];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'made_up', recovery_date: '2026-01-17', recovery_group_id: 'rg1' }),
      attendanceRow({ id: 'a2', lesson_id: 'l1', student_id: 's2', status: 'made_up', recovery_date: '2026-01-17', recovery_group_id: 'rg1' }),
    ];
    const entries = computeMonthEntries(lessons, attendance, students, groups, 2026, 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].groupStudentNames).toEqual(['Ana', 'Bogdan']);
  });

  it('afiseaza numele grupei pe fiecare lectie live - esential cand doua grupe diferite au o lectie in aceeasi zi/ora', () => {
    const lessons = [lesson({ id: 'l1', group_id: 'g1', format: 'grup', lesson_date: '2026-01-10' })];
    const attendance = [attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'present' })];
    const entries = computeMonthEntries(lessons, attendance, students, groups, 2026, 0);
    expect(entries[0].groupName).toBe('M1 Joi la 11:00');
  });

  it('numarul "#N" al lectiei e calculat dupa data reala (cronologic), nu dupa session_number brut din DB - o lectie adaugata retroactiv (backfill) primeste in DB urmatorul session_number liber la momentul crearii, care poate fi mai mare decat al unei lectii ulterioare deja existente', () => {
    // Scenariu real gasit in productie (grupa lui Daniel Tabacaru): lectia din 22 aug a fost
    // creata normal cu session_number 30; lectia din 8 aug a fost adaugata abia pe 25 aug
    // (backfill) si a primit session_number 31, desi cronologic e INAINTEA celei din 22 aug.
    const lessons = [
      lesson({ id: 'l30', group_id: 'g1', session_number: 30, lesson_date: '2026-08-22' }),
      lesson({ id: 'l31', group_id: 'g1', session_number: 31, lesson_date: '2026-08-08' }),
    ];
    const attendance = [
      attendanceRow({ id: 'a30', lesson_id: 'l30', student_id: 's1', status: 'present' }),
      attendanceRow({ id: 'a31', lesson_id: 'l31', student_id: 's1', status: 'present' }),
    ];
    const entries = computeMonthEntries(lessons, attendance, students, groups, 2026, 7); // August
    expect(entries.map((e) => ({ date: e.date, sessionNumber: e.sessionNumber }))).toEqual([
      { date: '2026-08-08', sessionNumber: 1 },
      { date: '2026-08-22', sessionNumber: 2 },
    ]);
  });
});

describe('computeGroupSessionRanks', () => {
  it('ignora lectiile fara nicio sedinta live (nu le numara si nu le lasa sa strice rangul urmatoarelor)', () => {
    const lessons = [
      lesson({ id: 'l1', group_id: 'g1', session_number: 1, lesson_date: '2026-01-05' }),
      lesson({ id: 'l2', group_id: 'g1', session_number: 2, lesson_date: '2026-01-12' }), // 100% absenta
      lesson({ id: 'l3', group_id: 'g1', session_number: 3, lesson_date: '2026-01-19' }),
    ];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'present' }),
      attendanceRow({ id: 'a2', lesson_id: 'l2', student_id: 's1', status: 'absent' }),
      attendanceRow({ id: 'a3', lesson_id: 'l3', student_id: 's1', status: 'present' }),
    ];
    const ranks = computeGroupSessionRanks(lessons, attendance);
    expect(ranks.get('l1')).toBe(1);
    expect(ranks.has('l2')).toBe(false);
    expect(ranks.get('l3')).toBe(2);
  });

  it('rangul e independent per grupa (doua grupe diferite au fiecare propria numarare de la 1)', () => {
    const lessons = [
      lesson({ id: 'l1', group_id: 'g1', lesson_date: '2026-01-05' }),
      lesson({ id: 'l2', group_id: 'g2', lesson_date: '2026-01-06' }),
    ];
    const attendance = [
      attendanceRow({ id: 'a1', lesson_id: 'l1', student_id: 's1', status: 'present' }),
      attendanceRow({ id: 'a2', lesson_id: 'l2', student_id: 's1', status: 'present' }),
    ];
    const ranks = computeGroupSessionRanks(lessons, attendance);
    expect(ranks.get('l1')).toBe(1);
    expect(ranks.get('l2')).toBe(1);
  });
});
