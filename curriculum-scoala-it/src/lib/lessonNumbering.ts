/**
 * Numerotare compacta pe module: fiecare modul standard are 16 lectii, deci orice numar
 * TOTAL de lectii efectuate (prezente + recuperari) se descompune deterministic in
 * "Modul X / Lectia Y" - fara zecimale, fara numerotare continua greu de citit.
 */

export function computeModuleLesson(totalLessons: number): { module: number; lesson: number } {
  const n = Math.max(1, Math.round(totalLessons));
  return {
    module: Math.floor((n - 1) / 16) + 1,
    lesson: ((n - 1) % 16) + 1,
  };
}

/** Formatul de afisare cerut: "M1 / L1" .. "M2 / L16" etc. */
export function formatModuleLesson(totalLessons: number): string {
  if (totalLessons <= 0) return 'M1 / L0';
  const { module, lesson } = computeModuleLesson(totalLessons);
  return `M${module} / L${lesson}`;
}

/** Inversul formulei - cate lectii TOTAL corespund unui Modul+Lectie dat. Folosit cand adminul
 * suprascrie manual pozitia unui elev (elevi cu istoric dinainte de Tracker). */
export function totalLessonsFor(moduleNumber: number, lessonNumber: number): number {
  return (Math.max(1, Math.round(moduleNumber)) - 1) * 16 + Math.max(0, Math.round(lessonNumber));
}

/** Modulul (1-based) caruia ii apartine o pozitie in materie (curriculum_index al lectiei). */
export function moduleOfIndex(curriculumIndex: number): number {
  return computeModuleLesson(curriculumIndex).module;
}

/**
 * Steluțele (temele) unui elev STRICT din lectiile unui anumit modul - fiecare modul porneste
 * de la 0, indiferent cate steluțe s-au strans in modulele anterioare (ex. 8/16 in M1 -> M2
 * incepe tot de la 0, nu de la 8).
 */
export function moduleStarsFor(
  studentId: string,
  module: number,
  lessons: { id: string; curriculum_index: number }[],
  attendance: { lesson_id: string; student_id: string; star_count: number | null }[],
): number {
  const lessonIds = new Set(lessons.filter((l) => moduleOfIndex(l.curriculum_index) === module).map((l) => l.id));
  return attendance.reduce(
    (sum, a) => (a.student_id === studentId && lessonIds.has(a.lesson_id) ? sum + (a.star_count ?? 0) : sum),
    0,
  );
}

/**
 * Modulul curent al unei grupe = modulul celei mai avansate lectii create (L17 deschide M2).
 * Fara nicio lectie creata inca, cade pe cea mai avansata pozitie manuala (lesson_offset) a
 * elevilor - altfel un elev nou adaugat la M2/L5 ar aparea in M1 pana la prima lectie.
 */
export function currentModuleOf(
  groupLessons: { curriculum_index: number }[],
  groupStudents: { lesson_offset: number }[] = [],
): number {
  if (groupLessons.length === 0) {
    return moduleOfIndex(groupStudents.reduce((max, s) => Math.max(max, s.lesson_offset ?? 0), 0));
  }
  return moduleOfIndex(groupLessons.reduce((max, l) => Math.max(max, l.curriculum_index), 0));
}

/**
 * Steluțele istorice ale elevului (legacy_module_stars - introduse manual pentru copiii cu istoric
 * dinainte de Tracker) apartin modulului pozitiei lui manuale (lesson_offset): M1/L10 -> M1,
 * M1/L16 -> tot M1 (M2 porneste de la 0). In orice alt modul nu se mai numara.
 */
export function legacyStarsInModule(
  student: { lesson_offset: number; legacy_module_stars?: number | null },
  module: number,
): number {
  const legacy = student.legacy_module_stars ?? 0;
  return legacy > 0 && moduleOfIndex(student.lesson_offset ?? 0) === module ? legacy : 0;
}

/**
 * Steluțele din modulul curent al fiecarui elev (acelasi calcul ca X/16 de pe Cardul Elevului din
 * Progress Tracker - vezi moduleStarsFor/currentModuleOf/legacyStarsInModule), pentru eticheta
 * "X din 16 steluțe".
 */
export function moduleStarsByStudent(
  students: { id: string; group_id: string; lesson_offset: number; legacy_module_stars?: number | null }[],
  lessons: { id: string; group_id: string; curriculum_index: number }[],
  attendance: { lesson_id: string; student_id: string; star_count: number | null }[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const s of students) {
    const groupLessons = lessons.filter((l) => l.group_id === s.group_id);
    const groupModule = currentModuleOf(groupLessons, students.filter((o) => o.group_id === s.group_id));
    result.set(s.id, moduleStarsFor(s.id, groupModule, groupLessons, attendance) + legacyStarsInModule(s, groupModule));
  }
  return result;
}
