import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerLesson, TrackerAttendance } from '@/lib/types';
import Registru from './Registru';

export default async function RegistruPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  const [{ data: lessons }, { data: attendance }, teachersRes] = await Promise.all([
    supabase.from('tracker_lessons').select('*').eq('teacher_id', profile.id),
    supabase.from('tracker_attendance').select('*').eq('teacher_id', profile.id).eq('status', 'made_up'),
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
    />
  );
}
