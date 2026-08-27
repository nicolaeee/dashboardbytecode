import type { CourseId } from './types';

/**
 * Cursurile "cunoscute", pentru care exista sabloane de diploma in public/diplome/<folder>.
 * Fiecare curs are module numerotate 1-4, fisier: Diploma_modulul<N>_<fileSuffix>.html.
 * Adaugarea unui curs nou aici inseamna extinderea acestei liste DUPA ce sabloanele lui
 * exista in public/diplome/<folder nou> - altfel link-urile ar da 404.
 *
 * O clasa poate avea si un curs CUSTOM (text liber, introdus din "+ Alt curs..." la
 * creare/editare - vezi CourseGrid din ProgressTracker.tsx), care NU e in lista de mai jos -
 * un astfel de curs nu are sablon de diploma (getCourse/diplomaTemplateUrl returneaza
 * null/undefined pentru el), dar ramane valid ca eticheta/filtru pe clasa.
 */
export const COURSES: { id: CourseId; label: string; folder: string; fileSuffix: string }[] = [
  { id: 'coblocks', label: 'Blocuri de cod', folder: 'CoBlocks', fileSuffix: 'blocuri' },
  { id: 'python', label: 'Python', folder: 'Python', fileSuffix: 'Python' },
  { id: 'roblox', label: 'Roblox', folder: 'Roblox', fileSuffix: 'Roblox' },
  { id: 'alfabetizare', label: 'Alfabetizare', folder: 'Alfabetizare', fileSuffix: 'Alfabetizare' },
  { id: 'unity', label: 'Unity', folder: 'Unity', fileSuffix: 'Unity' },
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

/** Snapshot-ul inghetat pe urgent_tasks la "Finalizeaza generarea diplomei" (coloanele
 * diploma_*) - vezi comentariul complet pe buildDiplomaUrl mai jos. */
export type DiplomaSnapshot = {
  diploma_course_id: CourseId | null;
  diploma_student_name: string | null;
  diploma_teacher_name: string | null;
  diploma_date: string | null;
  diploma_stars: number | null;
  diploma_total_stars: number | null;
};

/**
 * Diploma nu e un fisier stocat - e un sablon HTML din public/diplome/ deschis cu parametri in
 * URL. Reconstruim aici EXACT acelasi URL pe care l-a "generat" profesorul, din snapshot-ul
 * inghetat la "Finalizeaza generarea diplomei" (coloanele diploma_* din urgent_tasks) - NU din
 * date live (numele/stelutele elevului se pot schimba intre timp, iar adminul poate deschide
 * taskul in alta zi decat cea a finalizarii).
 *
 * Doua motive DISTINCTE pentru care butonul poate lipsi - afisate diferit in UI (vezi
 * renderTask din TaskUriUrgenteClient.tsx si tab-ul "Diplome Trimise" din admin/arhiva), ca sa
 * nu se confunde o problema reala cu o limitare cunoscuta:
 *  - 'missing-snapshot': coloanele diploma_* sunt goale pe task (migrarea SQL
 *    add_diploma_snapshot_to_urgent_tasks.sql nu a rulat inca, sau schema cache-ul PostgREST
 *    nu s-a reincarcat dupa ALTER TABLE) - task-ul exista, dar snapshot-ul nu s-a salvat.
 *  - 'no-template': cursul grupei e unul custom (text liber), fara sablon in public/diplome/.
 *
 * Folosita si in "Arhivă → Diplome Trimise" (admin/arhiva) - acelasi task ramane deschis
 * (diploma revizionabila oricand) chiar dupa ce e marcat COMPLETED, deci reconstructia trebuie
 * sa ramana identica in ambele locuri.
 */
export function buildDiplomaUrl(
  snapshot: DiplomaSnapshot, module: number
): { url: string; reason: null } | { url: null; reason: 'missing-snapshot' | 'no-template' } {
  if (!snapshot.diploma_course_id || !snapshot.diploma_student_name || !snapshot.diploma_teacher_name || !snapshot.diploma_date) {
    return { url: null, reason: 'missing-snapshot' };
  }
  const base = diplomaTemplateUrl(snapshot.diploma_course_id, module);
  if (!base) return { url: null, reason: 'no-template' };
  const params = new URLSearchParams({
    elev: snapshot.diploma_student_name,
    profesor: snapshot.diploma_teacher_name,
    curs: `Modulul ${module} - ${getCourse(snapshot.diploma_course_id)?.label ?? snapshot.diploma_course_id}`,
    data: snapshot.diploma_date,
    stelute: String(snapshot.diploma_stars ?? 0),
    totalStelute: String(snapshot.diploma_total_stars ?? 0),
  });
  return { url: `${base}?${params.toString()}`, reason: null };
}
