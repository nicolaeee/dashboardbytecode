import type { TrackerLesson, TrackerAttendance } from './types';

/**
 * Regula de aur a Payslip-ului: o lectie din curricula (un `tracker_lessons.id`) e platita
 * profesorului O SINGURA DATA, indiferent daca a fost tinuta la data programata (cu minim un
 * elev 'present' live) sau a fost 100% rateaza si recuperata ulterior. NU folosim `is_taught`
 * pentru asta - acel flag inseamna "materia a avansat" (adevarat si pentru 'made_up', ca sa
 * deblocheze M/L in ProgressTracker.tsx), nu "s-a tinut o sedinta live la lesson_date". O
 * lectie 100% absenta initial, apoi marcata 'made_up' pentru elevul ei, are `is_taught = true`
 * dar NU a avut loc nicio sedinta live la `lesson_date` - a avut loc doar recuperarea, la
 * `recovery_date`. Daca am fi folosit `is_taught` aici, lectia ar fi platita de doua ori: o
 * data ca lectie "grup"/"individual" fantoma la `lesson_date`, si inca o data ca "recuperare"
 * la `recovery_date`. Vezi Registru.tsx si registryCalc.test.ts pentru scenariul exact.
 */
export type PayslipRow = { grup: number; individual: number; recuperare: number };

export type RegistryEntry = {
  date: string;
  time: string | null;
  kind: 'grup' | 'individual' | 'recuperare';
  sessionNumber?: number;
  groupStudentNames?: string[];
};

type StudentOption = { id: string; name: string };

/** Id-urile lectiilor care au avut CEL PUTIN un elev 'present' live - singurul criteriu valid
 * pentru a plati coloana "grup"/"individual" din Payslip. */
export function liveLessonIds(attendance: TrackerAttendance[]): Set<string> {
  const set = new Set<string>();
  for (const a of attendance) if (a.status === 'present') set.add(a.lesson_id);
  return set;
}

/** O recuperare de grup (recovery_group_id comun) conteaza ca O SINGURA ora, indiferent de
 * cati elevi participa; o recuperare individuala (recovery_group_id null) conteaza separat
 * pentru fiecare elev, ca o ora distincta. */
export function computeRecoveryUnits(
  attendance: TrackerAttendance[],
  students: StudentOption[]
): { date: string; time: string | null; studentNames: string[] }[] {
  const seenGroups = new Set<string>();
  const units: { date: string; time: string | null; studentNames: string[] }[] = [];
  for (const a of attendance) {
    if (a.status !== 'made_up' || !a.recovery_date) continue;
    if (a.recovery_group_id) {
      if (seenGroups.has(a.recovery_group_id)) continue;
      seenGroups.add(a.recovery_group_id);
      const groupNames = attendance
        .filter((x) => x.recovery_group_id === a.recovery_group_id)
        .map((x) => students.find((s) => s.id === x.student_id)?.name ?? '?');
      units.push({ date: a.recovery_date, time: a.recovery_time, studentNames: groupNames });
    } else {
      const name = students.find((s) => s.id === a.student_id)?.name ?? '?';
      units.push({ date: a.recovery_date, time: a.recovery_time, studentNames: [name] });
    }
  }
  return units;
}

/** Tabelul Payslip pe 12 luni (index 0 = Ianuarie) pentru anul dat, fara nicio dublare intre
 * lectiile live si recuperarile lor. */
export function computePayslipTable(
  lessons: TrackerLesson[],
  attendance: TrackerAttendance[],
  students: StudentOption[],
  year: number
): PayslipRow[] {
  const liveIds = liveLessonIds(attendance);
  const rows: PayslipRow[] = Array.from({ length: 12 }, () => ({ grup: 0, individual: 0, recuperare: 0 }));
  for (const l of lessons) {
    if (!liveIds.has(l.id)) continue;
    const d = new Date(l.lesson_date);
    if (d.getFullYear() !== year) continue;
    if (l.format === 'individual') rows[d.getMonth()].individual += 1;
    else rows[d.getMonth()].grup += 1;
  }
  for (const u of computeRecoveryUnits(attendance, students)) {
    const d = new Date(u.date);
    if (d.getFullYear() !== year) continue;
    rows[d.getMonth()].recuperare += 1;
  }
  return rows;
}

export function computePayslipTotals(table: PayslipRow[]): PayslipRow {
  const t = { grup: 0, individual: 0, recuperare: 0 };
  for (const row of table) { t.grup += row.grup; t.individual += row.individual; t.recuperare += row.recuperare; }
  return t;
}

/** Detaliul unei singure luni (folosit de popup-ul din Registru.tsx) - aceleasi doua reguli
 * (excludere lectii non-live, dedup recuperari de grup) ca in computePayslipTable. */
export function computeMonthEntries(
  lessons: TrackerLesson[],
  attendance: TrackerAttendance[],
  students: StudentOption[],
  year: number,
  month: number
): RegistryEntry[] {
  const liveIds = liveLessonIds(attendance);
  const entries: RegistryEntry[] = [];
  for (const l of lessons) {
    if (!liveIds.has(l.id)) continue;
    const d = new Date(l.lesson_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      entries.push({ date: l.lesson_date, time: l.lesson_time, kind: l.format, sessionNumber: l.session_number });
    }
  }
  for (const u of computeRecoveryUnits(attendance, students)) {
    const d = new Date(u.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      entries.push({
        date: u.date, time: u.time, kind: 'recuperare',
        groupStudentNames: u.studentNames.length > 1 ? u.studentNames : undefined,
      });
    }
  }
  entries.sort((x, y) => x.date.localeCompare(y.date) || (x.time ?? '').localeCompare(y.time ?? ''));
  return entries;
}
