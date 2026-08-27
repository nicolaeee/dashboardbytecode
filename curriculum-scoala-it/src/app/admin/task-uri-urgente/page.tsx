import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { attachUrgentTaskDetails, type UrgentTaskWithDetails } from '@/lib/urgentTasks';
import TaskUriUrgenteClient from './TaskUriUrgenteClient';

export type { UrgentTaskWithDetails };

/**
 * "🚨 Task-uri Urgente" pentru admin - vezi supabase/migrations/add_urgent_tasks.sql.
 * Afișează STRICT ce mai necesită acțiune (status NEW/IN_PROGRESS) - task-urile finalizate
 * (diploma trimisă, monedele trimise) nu mai apar deloc aici, ci în "Arhivă → Diplome Trimise"
 * (admin/arhiva), unde rămân vizibile ca istoric până la ștergerea automată după 4 luni (vezi
 * cleanup_old_urgent_tasks, add_urgent_tasks_cleanup_cron.sql).
 */
export default async function TaskUriUrgentePage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from('urgent_tasks')
    .select('*')
    .neq('status', 'COMPLETED')
    .order('created_at', { ascending: false });

  const tasksWithDetails = await attachUrgentTaskDetails(supabase, tasks ?? []);

  // Lista completa de profesori pentru filtrul "Profesor" (nu doar cei cu task-uri deja
  // existente) - luata direct din baza de date, nu hardcodata (vezi TaskUriUrgenteClient.tsx).
  const { data: allTeachers } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name');
  const teacherOptions = (allTeachers ?? []).map((t) => ({ id: t.id, label: t.full_name || t.email }));

  return <TaskUriUrgenteClient viewerId={profile.id} initialTasks={tasksWithDetails} teacherOptions={teacherOptions} />;
}
