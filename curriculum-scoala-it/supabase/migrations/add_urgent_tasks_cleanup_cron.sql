-- ============================================================================
--  CURATARE AUTOMATA URGENT_TASKS (4 LUNI)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Task-urile din urgent_tasks (Task-uri Urgente, admin) mai vechi de 4 luni de la
--  created_at se sterg automat, o data pe zi, prin pg_cron - deja folosit in acest proiect
--  pentru archive_inactive_tracker_groups (schema.sql, sectiunea 10) si
--  send_overdue_diploma_alerts (sectiunea 13), asa ca REUTILIZAM extensia deja activata, fara
--  sa o instalam din nou.
--
--  Izolat strict pe urgent_tasks - nu atinge tracker_students/tracker_groups/tracker_lessons/
--  tracker_attendance si nici mecanismul de 16 prezente (pending_diploma_milestone etc.), care
--  nu citesc niciodata din urgent_tasks - tabela e doar un jurnal/vizualizare pentru admin,
--  fara nicio alta functionalitate care depinde de cat de vechi sunt randurile ei.
--
--  4 luni se calculeaza de la created_at (momentul crearii task-ului), NU de la o eventuala
--  actualizare ulterioara (schimbare de status etc.) - exact cum a fost cerut.
-- ============================================================================

create extension if not exists pg_cron;

create or replace function public.cleanup_old_urgent_tasks()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.urgent_tasks where created_at < now() - interval '4 months';
$$;

grant execute on function public.cleanup_old_urgent_tasks() to postgres, service_role;

-- cron.schedule cu un nume de job deja existent il actualizeaza (upsert), nu creeaza un
-- duplicat - dar 'cleanup-old-urgent-tasks-daily' e un nume nou, nefolosit de niciun alt job
-- din acest proiect (vezi 'archive-inactive-tracker-groups-daily' la 03:00 si
-- 'send-overdue-diploma-alerts-daily' la 07:00 - orele 04:00 aici nu se suprapun cu ele).
select cron.schedule(
  'cleanup-old-urgent-tasks-daily',
  '0 4 * * *',
  $$select public.cleanup_old_urgent_tasks();$$
);
