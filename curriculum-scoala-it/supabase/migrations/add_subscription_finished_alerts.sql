-- ============================================================================
--  ALERTA "💳 Abonament finalizat" (Task-uri Urgente, admin) + PACHET "Personalizat"
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  1) urgent_tasks.type accepta acum si 'SUBSCRIPTION_FINISHED' - task nou, declansat automat
--     (trigger SQL, nu client) cand soldul de lectii al unui elev (total_lessons_remaining)
--     ajunge la EXACT 0. Complet independent de webhook-ul Pabbly existent
--     (/api/lesson-balance-alerts, la 2 sau 0 ramase) - acela ramane neschimbat.
--
--  2) tracker_students.subscription_type accepta acum si 'custom' - pachet cu numar de lectii
--     ales liber (input numeric in formularul "Editeaza Elev"), pentru elevi vechi cu
--     abonamente personalizate care nu se incadreaza in niciun pachet cu numar fix.
--
--  3) pending_subscription_alert (coloana noua) - flag de dedublicare: true = exista deja un
--     task deschis pentru acest elev, nu se mai creeaza altul cat timp soldul ramane la 0.
--     Resetat automat la false cand soldul redevine pozitiv (reinnoire, din orice ecran),
--     ca urmatorul ciclu de epuizare sa poata declansa din nou alerta.
--
--  milestone ramane mereu 0 pentru SUBSCRIPTION_FINISHED (conceptul de "prag" din diplome nu se
--  aplica aici) - constrangerea unique(student_id, milestone, type) ar bloca altfel silentios a
--  doua alerta pentru acelasi elev, la un ciclu ulterior de epuizare; ON CONFLICT DO UPDATE
--  "redeschide" acelasi rand (status -> NEW, timestamp-uri proaspete) in loc sa esueze/fie ignorat.
-- ============================================================================

alter table public.urgent_tasks drop constraint if exists urgent_tasks_type_check;
alter table public.urgent_tasks add constraint urgent_tasks_type_check
  check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS', 'SUBSCRIPTION_FINISHED'));

alter table public.tracker_students drop constraint if exists tracker_students_subscription_type_check;
alter table public.tracker_students add constraint tracker_students_subscription_type_check
  check (subscription_type in (
    'individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral',
    'lunar_4', 'integral_16', 'integral_32', 'integral_48', 'custom'
  ));

alter table public.tracker_students
  add column if not exists pending_subscription_alert boolean not null default false;

create or replace function public.touch_subscription_finished_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.total_lessons_remaining > 0 then
    new.pending_subscription_alert := false;
    return new;
  end if;

  if new.total_lessons_remaining = 0 and old.total_lessons_remaining <> 0
     and not coalesce(old.pending_subscription_alert, false) then
    new.pending_subscription_alert := true;
    insert into public.urgent_tasks (type, student_id, teacher_id, milestone, milestone_reached_at, status)
    values ('SUBSCRIPTION_FINISHED', new.id, new.teacher_id, 0, now(), 'NEW')
    on conflict (student_id, milestone, type) do update
      set status = 'NEW', milestone_reached_at = now(), completed_at = null, completed_by = null;
  end if;

  return new;
end;
$$;

drop trigger if exists tracker_students_touch_subscription_alert on public.tracker_students;
create trigger tracker_students_touch_subscription_alert
  before update on public.tracker_students
  for each row execute function public.touch_subscription_finished_alert();
