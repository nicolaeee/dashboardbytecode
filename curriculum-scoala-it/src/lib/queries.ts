import { createClient } from '@/lib/supabase/server';
import { moduleUnlocked } from '@/lib/access';
import type {
  AccessMap, Course, LessonStub, Module, Platform, Profile, Tree, Lesson,
} from '@/lib/types';

export { toEmbedUrl } from '@/lib/embed';
export { moduleUnlocked, lessonUnlocked } from '@/lib/access';

/** Permisiunile profesorului curent (adminul are acces la tot). */
export async function getAccessMap(profile: Profile): Promise<AccessMap> {
  if (profile.role === 'admin') return { modules: new Set(['*']), lessons: new Set(['*']) };
  const supabase = await createClient();
  const [{ data: mp }, { data: lp }] = await Promise.all([
    supabase.from('module_permissions').select('module_id').eq('teacher_id', profile.id),
    supabase.from('lesson_permissions').select('lesson_id').eq('teacher_id', profile.id),
  ]);
  return {
    modules: new Set((mp ?? []).map((r) => r.module_id as string)),
    lessons: new Set((lp ?? []).map((r) => r.lesson_id as string)),
  };
}

/**
 * Arborele complet Platformă > Curs > Modul > Lecție.
 * Scheletul e vizibil pentru toți (ca profesorul să știe ce există), iar
 * `unlocked` spune dacă profesorul poate intra efectiv.
 */
export async function getTree(access: AccessMap): Promise<Tree> {
  const supabase = await createClient();
  const [{ data: platforms }, { data: courses }, { data: modules }, { data: lessons }] =
    await Promise.all([
      supabase.from('platforms').select('*').order('position').order('created_at'),
      supabase.from('courses').select('*').order('position').order('created_at'),
      supabase.from('modules').select('*').order('position').order('created_at'),
      supabase.from('lesson_index').select('*').order('position'),
    ]);

  const l = (lessons ?? []) as LessonStub[];
  const m = (modules ?? []) as Module[];
  const c = (courses ?? []) as Course[];

  return ((platforms ?? []) as Platform[]).map((p) => ({
    ...p,
    courses: c.filter((x) => x.platform_id === p.id).map((course) => ({
      ...course,
      modules: m.filter((x) => x.course_id === course.id).map((mod) => ({
        ...mod,
        unlocked: moduleUnlocked(access, mod.id),
        lessons: l.filter((x) => x.module_id === mod.id),
      })),
    })),
  }));
}

/** Verificare de acces la nivel de rută (nu doar vizual). */
export async function canAccessLesson(lessonId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('has_lesson_access', { p_lesson_id: lessonId });
  return !error && data === true;
}

export async function canAccessModule(moduleId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('has_module_access', { p_module_id: moduleId });
  return !error && data === true;
}

export type LessonContext = {
  lesson: Lesson;
  module: Module;
  course: Course;
  platform: Platform;
  siblings: LessonStub[];
};

/** Lecția + poziția ei în curriculum. Întoarce null dacă RLS blochează accesul. */
export async function getLessonContext(lessonId: string): Promise<LessonContext | null> {
  const supabase = await createClient();
  const { data: lesson } = await supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle();
  if (!lesson) return null;

  const { data: mod } = await supabase.from('modules').select('*').eq('id', lesson.module_id).single();
  if (!mod) return null;
  const { data: course } = await supabase.from('courses').select('*').eq('id', mod.course_id).single();
  if (!course) return null;
  const { data: platform } = await supabase.from('platforms').select('*').eq('id', course.platform_id).single();
  if (!platform) return null;
  const { data: siblings } = await supabase
    .from('lesson_index').select('*').eq('module_id', mod.id).order('position');

  return {
    lesson: lesson as Lesson,
    module: mod as Module,
    course: course as Course,
    platform: platform as Platform,
    siblings: (siblings ?? []) as LessonStub[],
  };
}
