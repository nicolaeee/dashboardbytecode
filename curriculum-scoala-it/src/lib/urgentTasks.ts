import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

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
