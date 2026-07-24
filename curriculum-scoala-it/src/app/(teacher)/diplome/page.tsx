import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent } from '@/lib/types';
import Diplome from './Diplome';

export type DiplomaGroupWithStudents = {
  id: string; group_name: string; course: TrackerGroup['course'];
  students: Pick<TrackerStudent, 'id' | 'name' | 'progress'>[];
};

export default async function DiplomePage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  const [{ data: groups }, { data: students }, teachersRes] = await Promise.all([
    supabase.from('tracker_groups').select('id, group_name, course').eq('teacher_id', profile.id).is('deleted_at', null).order('group_name'),
    supabase.from('tracker_students').select('id, group_id, name, progress').eq('teacher_id', profile.id).is('deleted_at', null).order('name'),
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email').order('full_name')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  const studentsByGroup = new Map<string, Pick<TrackerStudent, 'id' | 'name' | 'progress'>[]>();
  for (const s of students ?? []) {
    const list = studentsByGroup.get(s.group_id) ?? [];
    list.push({ id: s.id, name: s.name, progress: s.progress });
    studentsByGroup.set(s.group_id, list);
  }
  const initialGroups: DiplomaGroupWithStudents[] = (groups ?? []).map((g) => ({
    id: g.id, group_name: g.group_name, course: g.course, students: studentsByGroup.get(g.id) ?? [],
  }));

  return (
    <Diplome
      viewerId={profile.id}
      viewerName={profile.full_name || profile.email}
      isAdmin={isAdmin}
      teacherOptions={(teachersRes.data ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }))}
      initialGroups={initialGroups}
    />
  );
}
