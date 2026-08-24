import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { UrgentTask } from '@/lib/types';
import TaskUriUrgenteClient from './TaskUriUrgenteClient';

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
 * "🚨 Task-uri Urgente" pentru admin - vezi supabase/migrations/add_urgent_tasks.sql.
 * urgent_tasks nu duplică nume/clasă/curs (se citesc live aici, prin join manual la
 * tracker_students/tracker_groups/profiles, la fel ca în diplome/page.tsx), doar
 * identificatori + câmpurile care nu există deja în altă parte (recompensă, mesaj).
 */
export default async function TaskUriUrgentePage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from('urgent_tasks')
    .select('*')
    .order('created_at', { ascending: false });

  const studentIds = [...new Set((tasks ?? []).map((t) => t.student_id))];
  const teacherIds = [...new Set((tasks ?? []).map((t) => t.teacher_id).filter((id): id is string => !!id))];

  const [{ data: students }, { data: teachers }, { data: allTeachers }] = await Promise.all([
    studentIds.length
      ? supabase.from('tracker_students').select('id, name, short_name, group_id, parent_phones, parent_emails').in('id', studentIds)
      : Promise.resolve({ data: [] as { id: string; name: string; short_name: string | null; group_id: string; parent_phones: string[]; parent_emails: string[] }[] }),
    teacherIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
    // Lista completa de profesori pentru filtrul "Profesor" (nu doar cei cu task-uri deja
    // existente) - luata direct din baza de date, nu hardcodata (vezi TaskUriUrgenteClient.tsx).
    supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name'),
  ]);

  const groupIds = [...new Set((students ?? []).map((s) => s.group_id))];
  const { data: groups } = groupIds.length
    ? await supabase.from('tracker_groups').select('id, group_name, course').in('id', groupIds)
    : { data: [] as { id: string; group_name: string; course: string | null }[] };

  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const teacherById = new Map((teachers ?? []).map((t) => [t.id, t]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  const tasksWithDetails: UrgentTaskWithDetails[] = (tasks ?? []).map((t) => {
    const student = studentById.get(t.student_id);
    const group = student ? groupById.get(student.group_id) : undefined;
    const teacher = t.teacher_id ? teacherById.get(t.teacher_id) : undefined;
    return {
      ...(t as UrgentTask),
      student_name: student?.name ?? 'Elev șters',
      student_short_name: student?.short_name ?? null,
      parent_phones: student?.parent_phones ?? [],
      parent_emails: student?.parent_emails ?? [],
      teacher_name: teacher ? (teacher.full_name || teacher.email) : 'Profesor șters',
      group_name: group?.group_name ?? null,
      course: group?.course ?? null,
    };
  });

  const teacherOptions = (allTeachers ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }));

  return <TaskUriUrgenteClient viewerId={profile.id} initialTasks={tasksWithDetails} teacherOptions={teacherOptions} />;
}
