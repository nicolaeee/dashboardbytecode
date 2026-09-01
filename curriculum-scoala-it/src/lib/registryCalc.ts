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
  groupName?: string;
  groupStudentNames?: string[];
};

type StudentOption = { id: string; name: string };
type GroupOption = { id: string; group_name: string };

/** Id-urile lectiilor care au avut CEL PUTIN un elev 'present' live - singurul criteriu valid
 * pentru a plati coloana "grup"/"individual" din Payslip. */
export function liveLessonIds(attendance: TrackerAttendance[]): Set<string> {
  const set = new Set<string>();
  for (const a of attendance) if (a.status === 'present') set.add(a.lesson_id);
  return set;
}

/** O recuperare de grup (recovery_group_id comun) conteaza ca O SINGURA ora, indiferent de
 * cati elevi participa; o recuperare individuala (recovery_group_id null) conteaza separat
 * pentru fiecare elev, ca o ora distincta. `lessonId` = lectia originala ratata (pastrat ca sa
 * putem afisa in Registru din ce grupa a facut parte recuperarea, vezi computeMonthEntries). */
export function computeRecoveryUnits(
  attendance: TrackerAttendance[],
  students: StudentOption[]
): { date: string; time: string | null; studentNames: string[]; lessonId: string }[] {
  const seenGroups = new Set<string>();
  const units: { date: string; time: string | null; studentNames: string[]; lessonId: string }[] = [];
  for (const a of attendance) {
    if (a.status !== 'made_up' || !a.recovery_date) continue;
    if (a.recovery_group_id) {
      if (seenGroups.has(a.recovery_group_id)) continue;
      seenGroups.add(a.recovery_group_id);
      const groupNames = attendance
        .filter((x) => x.recovery_group_id === a.recovery_group_id)
        .map((x) => students.find((s) => s.id === x.student_id)?.name ?? '?');
      units.push({ date: a.recovery_date, time: a.recovery_time, studentNames: groupNames, lessonId: a.lesson_id });
    } else {
      const name = students.find((s) => s.id === a.student_id)?.name ?? '?';
      units.push({ date: a.recovery_date, time: a.recovery_time, studentNames: [name], lessonId: a.lesson_id });
    }
  }
  return units;
}

/** Rangul cronologic (1, 2, 3...) al fiecarei lectii LIVE in cadrul grupei ei, calculat dupa
 * lesson_date/lesson_time - NU dupa `session_number` brut din DB. `session_number` reflecta
 * ordinea in care lectiile au fost CREATE (adaugate din Tracker), nu data lor: o lectie
 * adaugata retroactiv pentru o data trecuta primeste session_number-ul urmator disponibil la
 * momentul crearii (vezi createLesson in ProgressTracker.tsx), care poate fi mai mare decat al
 * unei lectii ulterioare deja creata - afisarea "#N" din Registru trebuie sa ramana in ordine
 * cronologica (dupa data, doar lectiile efectuate live), nu in ordinea de creare in aplicatie. */
export function computeGroupSessionRanks(
  lessons: TrackerLesson[],
  attendance: TrackerAttendance[]
): Map<string, number> {
  const liveIds = liveLessonIds(attendance);
  const byGroup = new Map<string, TrackerLesson[]>();
  for (const l of lessons) {
    if (!liveIds.has(l.id)) continue;
    if (!byGroup.has(l.group_id)) byGroup.set(l.group_id, []);
    byGroup.get(l.group_id)!.push(l);
  }
  const ranks = new Map<string, number>();
  for (const group of byGroup.values()) {
    const sorted = [...group].sort(
      (a, b) => a.lesson_date.localeCompare(b.lesson_date) || (a.lesson_time ?? '').localeCompare(b.lesson_time ?? '')
    );
    sorted.forEach((l, i) => ranks.set(l.id, i + 1));
  }
  return ranks;
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
 * (excludere lectii non-live, dedup recuperari de grup) ca in computePayslipTable, plus numele
 * grupei (vezi TrackerLesson.group_id) pe fiecare intrare - fara el, doua lectii din grupe
 * DIFERITE cazute pe aceeasi data/ora arata identic ("Lecție grup #1") si par o dublare. */
export function computeMonthEntries(
  lessons: TrackerLesson[],
  attendance: TrackerAttendance[],
  students: StudentOption[],
  groups: GroupOption[],
  year: number,
  month: number
): RegistryEntry[] {
  const liveIds = liveLessonIds(attendance);
  const ranks = computeGroupSessionRanks(lessons, attendance);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const groupName = (groupId: string | undefined) => groups.find((g) => g.id === groupId)?.group_name;
  const entries: RegistryEntry[] = [];
  for (const l of lessons) {
    if (!liveIds.has(l.id)) continue;
    const d = new Date(l.lesson_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      entries.push({
        date: l.lesson_date, time: l.lesson_time, kind: l.format,
        sessionNumber: ranks.get(l.id), groupName: groupName(l.group_id),
      });
    }
  }
  for (const u of computeRecoveryUnits(attendance, students)) {
    const d = new Date(u.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      entries.push({
        date: u.date, time: u.time, kind: 'recuperare',
        groupName: groupName(lessonById.get(u.lessonId)?.group_id),
        groupStudentNames: u.studentNames.length > 1 ? u.studentNames : undefined,
      });
    }
  }
  entries.sort((x, y) => x.date.localeCompare(y.date) || (x.time ?? '').localeCompare(y.time ?? ''));
  return entries;
}
