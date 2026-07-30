import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance } from '@/lib/types';
import ProgressTracker from './ProgressTracker';

export default async function ProgressTrackerPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // Fiecare cont vede implicit doar propriile date; adminul poate alege alt profesor
  // din dropdown-ul din Progress Tracker (reincarcare client-side, ca in /registru).
  // GDPR: telefoanele/email-urile parintelui sunt coloane admin-only - un profesor nu
  // primeste deloc aceste valori in payload-ul paginii (nu doar ascunse in UI, ci absente
  // din raspuns).
  const [{ data: groups }, { data: students }, { data: lessons }, { data: attendance }, teachersRes] = await Promise.all([
    supabase.from('tracker_groups').select('*').eq('teacher_id', profile.id).order('created_at'),
    isAdmin
      ? supabase.from('tracker_students').select('*').eq('teacher_id', profile.id).order('created_at')
      : supabase.from('tracker_students').select('id,teacher_id,group_id,name,short_name,progress,lesson_offset,presence_count,absence_count,deleted_at,created_at').eq('teacher_id', profile.id).order('created_at'),
    supabase.from('tracker_lessons').select('*').eq('teacher_id', profile.id).order('session_number'),
    supabase.from('tracker_attendance').select('*').eq('teacher_id', profile.id),
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email').order('full_name')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  return (
    <ProgressTracker
      teacherId={profile.id}
      isAdmin={isAdmin}
      teacherOptions={(teachersRes.data ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }))}
      initialGroups={(groups ?? []) as TrackerGroup[]}
      initialStudents={(students ?? []) as TrackerStudent[]}
      initialLessons={(lessons ?? []) as TrackerLesson[]}
      initialAttendance={(attendance ?? []) as TrackerAttendance[]}
    />
  );
}
