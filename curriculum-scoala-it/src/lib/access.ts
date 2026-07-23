import type { AccessMap, LessonStub } from '@/lib/types';

/** Fără dependințe de server — utilizabile și din componente client. */
export function moduleUnlocked(access: AccessMap, moduleId: string) {
  return access.modules.has('*') || access.modules.has(moduleId);
}
export function lessonUnlocked(access: AccessMap, lesson: LessonStub) {
  return access.lessons.has('*') || access.lessons.has(lesson.id) || moduleUnlocked(access, lesson.module_id);
}
