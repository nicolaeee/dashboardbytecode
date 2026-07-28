-- ============================================================================
--  ARHIVARE AUTOMATA CLASE INACTIVE (6 luni fara nicio lectie/prezenta noua).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  IMPORTANT: necesita extensia "pg_cron". Daca linia CREATE EXTENSION de mai
--  jos esueaza cu o eroare de permisiuni, activeaz-o intai manual din
--  Supabase Dashboard -> Database -> Extensions -> cauta "pg_cron" -> Enable,
--  apoi ruleaza din nou restul acestui fisier.
--
--  Arhivarea = soft delete (deleted_at), exact ca butonul manual "Sterge
--  Clasa" -> lectiile/prezentele NU sunt sterse, raman vizibile in /registru
--  (care citeste tracker_lessons/tracker_attendance direct, fara sa filtreze
--  dupa tracker_groups.deleted_at). Clasa arhivata automat apare in Urna si
--  poate fi restaurata manual de profesor daca arhivarea a fost gresita.
-- ============================================================================

create extension if not exists pg_cron;

create or replace function public.archive_inactive_tracker_groups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_ids uuid[];
begin
  with last_activity as (
    select
      g.id,
      greatest(
        g.created_at,
        coalesce(max(l.created_at), g.created_at),
        coalesce(max(a.updated_at), g.created_at)
      ) as activity_at
    from public.tracker_groups g
    left join public.tracker_lessons l on l.group_id = g.id
    left join public.tracker_attendance a on a.lesson_id = l.id
    where g.deleted_at is null
    group by g.id, g.created_at
  ),
  archived as (
    update public.tracker_groups g
    set deleted_at = now()
    from last_activity la
    where g.id = la.id
      and la.activity_at < now() - interval '6 months'
    returning g.id
  )
  select array_agg(id) into archived_ids from archived;

  if archived_ids is not null then
    update public.tracker_students s
    set deleted_at = now()
    where s.group_id = any(archived_ids) and s.deleted_at is null;
  end if;
end;
$$;

grant execute on function public.archive_inactive_tracker_groups() to postgres, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'archive-inactive-tracker-groups-daily') then
    perform cron.unschedule('archive-inactive-tracker-groups-daily');
  end if;
end $$;

-- Zilnic la 03:00 UTC.
select cron.schedule(
  'archive-inactive-tracker-groups-daily',
  '0 3 * * *',
  $$select public.archive_inactive_tracker_groups();$$
);
