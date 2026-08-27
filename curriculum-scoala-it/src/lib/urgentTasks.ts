import { createClient } from '@/lib/supabase/server';
import type { Profile, UrgentTask } from '@/lib/types';

/**
 * Numărul de task-uri urgente noi (status NEW) - folosit pentru indicatorul "Task-uri urgente (N)"
 * din nav (vezi admin/layout.tsx și (teacher)/layout.tsx). Doar adminul are acces la urgent_tasks
 * (RLS) - pentru profesor întoarcem direct 0, fără interogare inutilă.
 */
export async function getNewUrgentTaskCount(profile: Profile): Promise<number> {
  if (profile.role !== 'admin') return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from('urgent_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'NEW');
  return count ?? 0;
}

export type UrgentTaskWithDetails = UrgentTask & {
  student_name: string;
  student_short_name: string | null;
  parent_phones: string[];
  parent_emails: string[];
  teacher_name: string;
  group_name: string | null;
  course: string | null;
};

/**
 * Alătură fiecărui urgent_task numele elevului/profesorului/clasei/cursului - citite live prin
 * join manual la tracker_students/tracker_groups/profiles (urgent_tasks nu le duplică, la fel
 * ca în diplome/page.tsx), NU din snapshot-ul diploma_* (acela ramane rezervat exclusiv
 * reconstruirii URL-ului diplomei, vezi buildDiplomaUrl în TaskUriUrgenteClient.tsx). Extras din
 * admin/task-uri-urgente/page.tsx ca să poată fi refolosit identic și de "Arhivă → Diplome
 * Trimise" (admin/arhiva/page.tsx), fără să diveargă cele două liste în timp.
 */
export async function attachUrgentTaskDetails(
  supabase: Awaited<ReturnType<typeof createClient>>, tasks: UrgentTask[]
): Promise<UrgentTaskWithDetails[]> {
  const studentIds = [...new Set(tasks.map((t) => t.student_id))];
  const teacherIds = [...new Set(tasks.map((t) => t.teacher_id).filter((id): id is string => !!id))];

  const [{ data: students }, { data: teachers }] = await Promise.all([
    studentIds.length
      ? supabase.from('tracker_students').select('id, name, short_name, group_id, parent_phones, parent_emails').in('id', studentIds)
      : Promise.resolve({ data: [] as { id: string; name: string; short_name: string | null; group_id: string; parent_phones: string[]; parent_emails: string[] }[] }),
    teacherIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
  ]);

  const groupIds = [...new Set((students ?? []).map((s) => s.group_id))];
  const { data: groups } = groupIds.length
    ? await supabase.from('tracker_groups').select('id, group_name, course').in('id', groupIds)
    : { data: [] as { id: string; group_name: string; course: string | null }[] };

  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const teacherById = new Map((teachers ?? []).map((t) => [t.id, t]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  return tasks.map((t) => {
    const student = studentById.get(t.student_id);
    const group = student ? groupById.get(student.group_id) : undefined;
    const teacher = t.teacher_id ? teacherById.get(t.teacher_id) : undefined;
    return {
      ...t,
      student_name: student?.name ?? 'Elev șters',
      student_short_name: student?.short_name ?? null,
      parent_phones: student?.parent_phones ?? [],
      parent_emails: student?.parent_emails ?? [],
      teacher_name: teacher ? (teacher.full_name || teacher.email) : 'Profesor șters',
      group_name: group?.group_name ?? null,
      course: group?.course ?? null,
    };
  });
}
