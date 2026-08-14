-- ============================================================================
--  ALERTA DIPLOMA INTARZIATA (>= 3 zile LUCRATOARE de la deschiderea task-ului)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Nu introducem un status nou de diploma - aplicatia are deja conceptul de
--  "task de diploma deschis" (tracker_students.pending_diploma_milestone, setat
--  la "Am inteles" pe popup-ul de celebrare, golit la "Am trimis diploma" - vezi
--  handleAcknowledgeDiplomaMilestone/handleMarkDiplomaSent in ProgressTracker.tsx).
--  Lipsea DOAR un timestamp al momentului in care task-ul a devenit pending -
--  il adaugam si il intretinem automat printr-un trigger, ca sa nu fie nevoie
--  sa atingem deloc codul din ProgressTracker.tsx care seteaza/goleste
--  pending_diploma_milestone.
--
--  Necesita extensiile "pg_cron" SI "pg_net" (Supabase -> Database -> Extensions,
--  daca CREATE EXTENSION de mai jos esueaza cu o eroare de permisiuni).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.tracker_students
  add column pending_diploma_milestone_at timestamptz,
  -- Dedup: fara acest camp, cron-ul ar retrimite aceeasi alerta in fiecare zi cat timp
  -- diploma ramane netrimisa (a 4-a, a 5-a zi lucratoare...) - il resetam automat (vezi
  -- trigger-ul de mai jos) de fiecare data cand pending_diploma_milestone se schimba, ca un
  -- task NOU sa poata alerta din nou dupa alte 3 zile lucratoare daca ajunge si el intarziat.
  add column diploma_overdue_alert_sent_at timestamptz;

-- Intretine pending_diploma_milestone_at si diploma_overdue_alert_sent_at automat, la orice
-- UPDATE care schimba pending_diploma_milestone - indiferent pe ce cale se face update-ul
-- (ProgressTracker.tsx azi, orice alt client maine), fara sa fie nevoie sa modificam acel cod.
create or replace function public.touch_pending_diploma_milestone()
returns trigger language plpgsql as $$
begin
  if new.pending_diploma_milestone is distinct from old.pending_diploma_milestone then
    new.pending_diploma_milestone_at := case when new.pending_diploma_milestone is null then null else now() end;
    new.diploma_overdue_alert_sent_at := null;
  end if;
  return new;
end;
$$;

create trigger tracker_students_touch_pending_diploma
  before update on public.tracker_students
  for each row execute function public.touch_pending_diploma_milestone();

-- Adauga N zile LUCRATOARE (luni-vineri, sambata/duminica sarite) la o data - folosita mai jos
-- ca sa determinam exact data la care un task de diploma deschis devine "intarziat" (3 zile
-- lucratoare de la pending_diploma_milestone_at), nu doar 3 zile calendaristice.
create or replace function public.add_business_days(start_date date, num_days int)
returns date language plpgsql immutable as $$
declare
  result date := start_date;
  added int := 0;
begin
  while added < num_days loop
    result := result + 1;
    if extract(isodow from result) < 6 then -- isodow: 1=Luni .. 5=Vineri, 6=Sambata, 7=Duminica
      added := added + 1;
    end if;
  end loop;
  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Job zilnic: cauta task-urile de diploma deschise de minim 3 zile LUCRATOARE si
-- nealertate inca, trimite webhook-ul Pabbly (async, prin pg_net - nu blocheaza
-- cron-ul), apoi marcheaza alerta ca trimisa (diploma_overdue_alert_sent_at).
-- ----------------------------------------------------------------------------
create or replace function public.send_overdue_diploma_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select s.id, s.name as student_name, s.pending_diploma_milestone_at,
           coalesce(nullif(p.full_name, ''), p.email) as teacher_name
    from public.tracker_students s
    join public.profiles p on p.id = s.teacher_id
    where s.deleted_at is null
      and s.pending_diploma_milestone is not null
      and current_date >= public.add_business_days(s.pending_diploma_milestone_at::date, 3)
      and s.diploma_overdue_alert_sent_at is null
  loop
    perform net.http_post(
      url := 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY4MDYzNjA0M2Q1MjZjNTUzMjUxMzMi_pc',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'nume_copil', r.student_name,
        'nume_profesor', r.teacher_name,
        'data_cererii', r.pending_diploma_milestone_at,
        'mesaj_alerta', 'Profesorul nu a trimis diploma de 3 zile lucrătoare. Te rugăm să ceri diploma.'
      )
    );

    update public.tracker_students set diploma_overdue_alert_sent_at = now() where id = r.id;
  end loop;
end;
$$;

grant execute on function public.send_overdue_diploma_alerts() to postgres, service_role;

select cron.schedule(
  'send-overdue-diploma-alerts-daily',
  '0 7 * * *',
  $$select public.send_overdue_diploma_alerts();$$
);
