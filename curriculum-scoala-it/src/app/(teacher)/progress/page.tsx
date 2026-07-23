import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TrackerGroup, TrackerStudent } from '@/lib/types';
import ProgressTracker from './ProgressTracker';

export default async function ProgressTrackerPage() {
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: groups }, { data: students }] = await Promise.all([
    supabase.from('tracker_groups').select('*').eq('teacher_id', profile.id).order('created_at'),
    supabase.from('tracker_students').select('*').eq('teacher_id', profile.id).order('created_at'),
  ]);

  return (
    <ProgressTracker
      teacherId={profile.id}
      initialGroups={(groups ?? []) as TrackerGroup[]}
      initialStudents={(students ?? []) as TrackerStudent[]}
    />
  );
}
