'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EntityKind, Role } from '@/lib/types';

const TABLES: Record<EntityKind, string> = {
  platform: 'platforms',
  course: 'courses',
  module: 'modules',
  lesson: 'lessons',
};
const PARENT_KEY: Record<EntityKind, string | null> = {
  platform: null,
  course: 'platform_id',
  module: 'course_id',
  lesson: 'module_id',
};

type Result = { ok: true } | { ok: false; error: string };

/** Nicio scriere fără verificarea rolului pe server (RLS este a doua barieră). */
async function adminGuard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesiune expirată. Autentifică-te din nou.');
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'admin') throw new Error('Doar administratorii pot face această operațiune.');
  return { supabase, userId: user.id };
}

function refresh() {
  revalidatePath('/', 'layout');
}

/** Următoarea poziție liberă între frații nodului. */
async function nextPosition(supabase: Awaited<ReturnType<typeof createClient>>, kind: EntityKind, parentId: string | null) {
  let q = supabase.from(TABLES[kind]).select('position').order('position', { ascending: false }).limit(1);
  const key = PARENT_KEY[kind];
  if (key && parentId) q = q.eq(key, parentId);
  const { data } = await q;
  return (data?.[0]?.position ?? -1) + 1;
}

// ---------------------------------------------------------------- CREARE / EDITARE
export async function saveNode(
  kind: EntityKind,
  values: Record<string, string>,
  id?: string
): Promise<Result> {
  try {
    const { supabase } = await adminGuard();
    const parentKey = PARENT_KEY[kind];
    const parentId = parentKey ? values[parentKey] : null;

    if (id) {
      // La editare nu mutăm nodul sub alt părinte
      const rest = { ...values };
      if (parentKey) delete rest[parentKey];
      const { error } = await supabase.from(TABLES[kind]).update(rest).eq('id', id);
      if (error) throw error;
    } else {
      const position = await nextPosition(supabase, kind, parentId);
      const { error } = await supabase.from(TABLES[kind]).insert({ ...values, position });
      if (error) throw error;
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- ȘTERGERE
export async function deleteNode(kind: EntityKind, id: string): Promise<Result> {
  try {
    const { supabase } = await adminGuard();
    const { error } = await supabase.from(TABLES[kind]).delete().eq('id', id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- REORDONARE
export async function moveNode(
  kind: EntityKind,
  id: string,
  direction: 'up' | 'down',
  parentId: string | null
): Promise<Result> {
  try {
    const { supabase } = await adminGuard();
    const key = PARENT_KEY[kind];
    let q = supabase.from(TABLES[kind]).select('id, position').order('position');
    if (key && parentId) q = q.eq(key, parentId);
    const { data, error } = await q;
    if (error) throw error;

    const list = (data ?? []) as { id: string; position: number }[];
    const i = list.findIndex((n) => n.id === id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };

    await supabase.from(TABLES[kind]).update({ position: list[j].position }).eq('id', list[i].id);
    await supabase.from(TABLES[kind]).update({ position: list[i].position }).eq('id', list[j].id);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ================================================================ PROFESORI
export async function createTeacher(values: {
  full_name: string; email: string; password: string; role: Role;
}): Promise<Result> {
  try {
    await adminGuard();
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: values.email.trim(),
      password: values.password,
      email_confirm: true,
      user_metadata: { full_name: values.full_name, role: values.role },
    });
    if (error) throw new Error(error.message.includes('already') ? 'Există deja un cont cu acest email.' : error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setUserRole(userId: string, role: Role): Promise<Result> {
  try {
    const { supabase, userId: me } = await adminGuard();
    if (userId === me && role === 'teacher') {
      return { ok: false, error: 'Nu îți poți retrage propriul rol de administrator.' };
    }
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setUserActive(userId: string, is_active: boolean): Promise<Result> {
  try {
    const { supabase, userId: me } = await adminGuard();
    if (userId === me) return { ok: false, error: 'Nu îți poți dezactiva propriul cont.' };
    const { error } = await supabase.from('profiles').update({ is_active }).eq('id', userId);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resetTeacherPassword(userId: string, password: string): Promise<Result> {
  try {
    await adminGuard();
    if (password.length < 8) return { ok: false, error: 'Parola trebuie să aibă minim 8 caractere.' };
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTeacher(userId: string): Promise<Result> {
  try {
    const { userId: me } = await adminGuard();
    if (userId === me) return { ok: false, error: 'Nu îți poți șterge propriul cont.' };
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ================================================================ PERMISIUNI
export async function setModuleAccess(
  teacherId: string, moduleIds: string[], granted: boolean
): Promise<Result> {
  try {
    const { supabase, userId } = await adminGuard();
    if (moduleIds.length === 0) return { ok: true };
    if (granted) {
      const rows = moduleIds.map((module_id) => ({ teacher_id: teacherId, module_id, granted_by: userId }));
      const { error } = await supabase.from('module_permissions').upsert(rows, { onConflict: 'teacher_id,module_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('module_permissions')
        .delete().eq('teacher_id', teacherId).in('module_id', moduleIds);
      if (error) throw error;
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setLessonAccess(
  teacherId: string, lessonIds: string[], granted: boolean
): Promise<Result> {
  try {
    const { supabase, userId } = await adminGuard();
    if (lessonIds.length === 0) return { ok: true };
    if (granted) {
      const rows = lessonIds.map((lesson_id) => ({ teacher_id: teacherId, lesson_id, granted_by: userId }));
      const { error } = await supabase.from('lesson_permissions').upsert(rows, { onConflict: 'teacher_id,lesson_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('lesson_permissions')
        .delete().eq('teacher_id', teacherId).in('lesson_id', lessonIds);
      if (error) throw error;
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
