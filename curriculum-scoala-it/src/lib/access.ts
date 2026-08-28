import type { AccessMap, LessonStub, Tree } from '@/lib/types';

/** Fără dependințe de server — utilizabile și din componente client. */
export function moduleUnlocked(access: AccessMap, moduleId: string) {
  return access.modules.has('*') || access.modules.has(moduleId);
}
export function lessonUnlocked(access: AccessMap, lesson: LessonStub) {
  return access.lessons.has('*') || access.lessons.has(lesson.id) || moduleUnlocked(access, lesson.module_id);
}

/**
 * "Strict necesar" - varianta arborelui pentru profesor: pastreaza doar modulele/lectiile
 * la care are acces explicit (module_permissions / lesson_permissions), in loc sa arate
 * tot scheletul scolii cu lacat pe ce nu poate deschide. Cursurile si platformele ramase
 * fara niciun modul vizibil dispar la randul lor. Adminul (access = '*') nu trece prin
 * aceasta functie - el vede arborele complet, nefiltrat.
 */
export function filterTreeForTeacher(tree: Tree, access: AccessMap): Tree {
  return tree
    .map((platform) => ({
      ...platform,
      courses: platform.courses
        .map((course) => ({
          ...course,
          modules: course.modules
            .map((mod) => ({
              ...mod,
              lessons: moduleUnlocked(access, mod.id)
                ? mod.lessons
                : mod.lessons.filter((lesson) => lessonUnlocked(access, lesson)),
            }))
            .filter((mod) => mod.lessons.length > 0),
        }))
        .filter((course) => course.modules.length > 0),
    }))
    .filter((platform) => platform.courses.length > 0);
}
