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
