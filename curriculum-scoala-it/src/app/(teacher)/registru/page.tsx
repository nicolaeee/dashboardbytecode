import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerLesson, TrackerAttendance } from '@/lib/types';
import Registru from './Registru';

export default async function RegistruPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // `tracker_students` (doar id+name) - necesar STRICT ca sa afisam numele elevilor participanti
  // la o recuperare de grup in detaliul lunar (vezi recovery_group_id, Registru.tsx); nimic
  // sensibil (GDPR), spre deosebire de parent_phones/parent_emails care nu sunt cerute aici.
  const [{ data: lessons }, { data: attendance }, { data: students }, teachersRes] = await Promise.all([
    supabase.from('tracker_lessons').select('*').eq('teacher_id', profile.id),
    supabase.from('tracker_attendance').select('*').eq('teacher_id', profile.id).eq('status', 'made_up'),
    supabase.from('tracker_students').select('id, name').eq('teacher_id', profile.id),
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email').order('full_name')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  return (
    <Registru
      viewerId={profile.id}
      isAdmin={isAdmin}
      teacherOptions={(teachersRes.data ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }))}
      initialLessons={(lessons ?? []) as TrackerLesson[]}
      initialAttendance={(attendance ?? []) as TrackerAttendance[]}
      initialStudents={(students ?? []) as { id: string; name: string }[]}
    />
  );
}
