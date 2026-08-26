import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance } from '@/lib/types';
import ProgressTracker from './ProgressTracker';

export default async function ProgressTrackerPage({
  searchParams,
}: {
  // Revenire din /diplome dupa "Finalizeaza generarea diplomei" (vezi Diplome.tsx) - cand
  // adminul rasfoia clasele altui profesor, pastram acel profesor selectat.
  searchParams: Promise<{ teacherId?: string }>;
}) {
  const profile = await requireUser();
  const { teacherId: viewedTeacherIdParam } = await searchParams;
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // Fiecare cont vede implicit doar propriile date; adminul poate alege alt profesor
  // din dropdown-ul din Progress Tracker (reincarcare client-side, ca in /registru).
  // GDPR: telefoanele/email-urile parintelui sunt coloane admin-only - un profesor nu
  // primeste deloc aceste valori in payload-ul paginii (nu doar ascunse in UI, ci absente
  // din raspuns).
  const [{ data: groups }, { data: students }, { data: lessons }, { data: attendance }, teachersRes] = await Promise.all([
    // Clasele arhivate (is_archived - vezi sync_group_archive_status) dispar complet din
    // contul profesorului, aici la sursa - nu doar ascunse in UI. Vizibile doar in "Arhivă
    // Clase" (Admin), vezi src/app/admin/clase-arhivate.
    supabase.from('tracker_groups').select('*').eq('teacher_id', profile.id).eq('is_archived', false).order('created_at'),
    isAdmin
      ? supabase.from('tracker_students').select('*').eq('teacher_id', profile.id).order('created_at')
      : supabase.from('tracker_students').select('id,teacher_id,group_id,name,short_name,progress,lesson_offset,presence_count,absence_count,pending_diploma_milestone,last_diploma_issued_milestone,pending_makeups,absence_date,makeup_notification_count,last_makeup_notification,is_scheduled,status,status_changed_at,status_changed_by,status_note,subscription_type,total_lessons_remaining,deleted_at,created_at').eq('teacher_id', profile.id).order('created_at'),
    supabase.from('tracker_lessons').select('*').eq('teacher_id', profile.id).order('session_number'),
    supabase.from('tracker_attendance').select('*').eq('teacher_id', profile.id),
    isAdmin
      ? supabase.from('profiles').select('id, full_name, email').order('full_name')
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string }[] | null }),
  ]);

  return (
    <ProgressTracker
      teacherId={profile.id}
      teacherName={profile.full_name || profile.email}
      teacherPhone={profile.phone}
      makeupCalendarLink={profile.makeup_calendar_link}
      isAdmin={isAdmin}
      teacherOptions={(teachersRes.data ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }))}
      initialGroups={(groups ?? []) as TrackerGroup[]}
      initialStudents={(students ?? []) as TrackerStudent[]}
      initialLessons={(lessons ?? []) as TrackerLesson[]}
      initialAttendance={(attendance ?? []) as TrackerAttendance[]}
      initialViewedTeacherId={viewedTeacherIdParam ?? null}
    />
  );
}
