import type { CourseId } from './types';

/**
 * Cursurile pentru care exista sabloane de diploma in public/diplome/<folder>.
 * Fiecare curs are module numerotate 1-4, fisier: Diploma_modulul<N>_<fileSuffix>.html.
 * Adaugarea unui curs nou (ex: "Delighted") inseamna extinderea acestei liste DUPA ce
 * sabloanele lui exista in public/diplome/<folder nou> - altfel link-urile ar da 404.
 */
export const COURSES: { id: CourseId; label: string; folder: string; fileSuffix: string }[] = [
  { id: 'coblocks', label: 'Blocuri de cod', folder: 'CoBlocks', fileSuffix: 'blocuri' },
  { id: 'python', label: 'Python', folder: 'Python', fileSuffix: 'Python' },
  { id: 'roblox', label: 'Roblox', folder: 'Roblox', fileSuffix: 'Roblox' },
  { id: 'alfabetizare', label: 'Alfabetizare', folder: 'Alfabetizare', fileSuffix: 'Alfabetizare' },
  { id: 'unity', label: 'Unity', folder: 'Unity', fileSuffix: 'Unity' },
  { id: 'delighted', label: 'Delighted', folder: 'Delighted', fileSuffix: 'Delighted' },
];

export const DIPLOMA_MODULES = [1, 2, 3, 4];

export function getCourse(id: CourseId | string | null | undefined) {
  return COURSES.find((c) => c.id === id) ?? null;
}

/** Construieste URL-ul public al sablonului curatat pentru cursul + modulul date. */
export function diplomaTemplateUrl(courseId: CourseId, moduleNumber: number) {
  const course = getCourse(courseId);
  if (!course) return null;
  return `/diplome/${course.folder}/Diploma_modulul${moduleNumber}_${course.fileSuffix}.html`;
}

/** Stelutele "in modulul curent" ale unui elev, pe baza progress-ului brut din tracker. */
export function starsForModule(progress: number) {
  if (progress > 0 && progress % 16 === 0) return 16;
  return progress % 16;
}

export function todayFormatted() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
