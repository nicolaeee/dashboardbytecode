-- ============================================================================
--  Inchide taskurile "🎓 Diplomă necesară" ramase agatate la Puscasu Bogdan - la cererea
--  adminului (diplomele au fost generate, dar taskurile nu s-au inchis - vezi
--  supabase/migrations/fix_diploma_task_stuck_after_module_4.sql pentru cauza).
--  Marcheaza pragul ca emis (last_diploma_issued_milestone) si inchide alertele admin
--  "Diplomă netrimisă" (DIPLOMA_NOT_SENT) ale acelorasi elevi. NU sterge diplome si NU atinge
--  prezentele, steluțele sau soldul.
--  Coloana "curs" din rezultat: "(fara curs)" = clasa nu are curs setat -> generatorul de
--  diplome nu se poate precompleta pentru acel elev (cauza probabila daca se repeta).
-- ============================================================================
with bogdan as (
  select id from public.profiles
  where full_name ilike '%bogdan%' and (full_name ilike '%pușcașu%' or full_name ilike '%puscasu%' or full_name ilike '%pușcasu%' or full_name ilike '%puscașu%')
),
tinta as (
  select s.id, s.name, s.group_id, s.pending_diploma_milestone as prag
  from public.tracker_students s
  where s.teacher_id in (select id from bogdan) and s.pending_diploma_milestone > 0 and s.deleted_at is null
),
inchise as (
  update public.tracker_students s
  set last_diploma_issued_milestone = greatest(s.last_diploma_issued_milestone, t.prag),
      pending_diploma_milestone = null
  from tinta t where s.id = t.id
  returning s.id
),
alerte as (
  update public.urgent_tasks u
  set status = 'COMPLETED', completed_at = now(), completed_by = null
  where u.type = 'DIPLOMA_NOT_SENT' and u.status <> 'COMPLETED' and u.student_id in (select id from tinta)
  returning u.id
)
select t.name as elev_inchis, t.prag, g.group_name as clasa, coalesce(g.course, '(fara curs)') as curs,
       (select count(*) from inchise) as taskuri_inchise,
       (select count(*) from alerte) as alerte_admin_inchise
from tinta t
join public.tracker_groups g on g.id = t.group_id
order by t.name;
