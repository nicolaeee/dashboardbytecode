import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent, TrackerLesson, TrackerAttendance } from '@/lib/types';
import ProgressTracker from './ProgressTracker';

export default async function ProgressTrackerPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  // Adminul vede toate grupele tuturor profesorilor (RLS permite acest lucru doar lui);
  // profesorul ramane restrictionat la propriile date, ca pana acum.
  let groupsQuery = supabase.from('tracker_groups').select('*').order('created_at');
  let studentsQuery = supabase.from('tracker_students').select('*').order('created_at');
  let lessonsQuery = supabase.from('tracker_lessons').select('*').order('session_number');
  let attendanceQuery = supabase.from('tracker_attendance').select('*');
  if (!isAdmin) {
    groupsQuery = groupsQuery.eq('teacher_id', profile.id);
    studentsQuery = studentsQuery.eq('teacher_id', profile.id);
    lessonsQuery = lessonsQuery.eq('teacher_id', profile.id);
    attendanceQuery = attendanceQuery.eq('teacher_id', profile.id);
  }

  const [{ data: groups }, { data: students }, { data: lessons }, { data: attendance }] = await Promise.all([
    groupsQuery, studentsQuery, lessonsQuery, attendanceQuery,
  ]);

  return (
    <ProgressTracker
      teacherId={profile.id}
      initialGroups={(groups ?? []) as TrackerGroup[]}
      initialStudents={(students ?? []) as TrackerStudent[]}
      initialLessons={(lessons ?? []) as TrackerLesson[]}
      initialAttendance={(attendance ?? []) as TrackerAttendance[]}
    />
  );
}
