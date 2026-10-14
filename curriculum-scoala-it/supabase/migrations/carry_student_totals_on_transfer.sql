-- ============================================================================
--  Transfer elev la alt profesor: numarul de lectii efectuate merge cu el. Ruleaza acest fisier o
--  singura data in Supabase -> SQL Editor (se poate rula si de mai multe ori - idempotent).
--  Nu schimba nicio coloana citita de /progress, deci ordinea fata de publicarea codului nu
--  conteaza.
--
--  Cerinta (2026-10-14): istoricul (prezente, recuperari, steluțe pe lectii) RAMANE la
--  vechiul profesor, exact ca pana acum - nu se muta niciun rand din tracker_lessons /
--  tracker_attendance, registrul/payslip-ul (taught_by) nu se schimba. La noul profesor
--  se transfera AUTOMAT doar numarul de lectii efectuate (eticheta M{x}/L{y}). Restul
--  (prezente, absente, steluțe in modul) le seteaza ADMINUL manual, dupa caz, din Editeaza Elev.
--
--  Pana acum transferul muta doar randul din tracker_students; prezentele vechi raman cu
--  teacher_id al vechiului profesor, iar Progress Tracker incarca doar prezentele profesorului
--  vizualizat (.eq('teacher_id', ...)) -> la noul profesor copilul pornea practic de la zero
--  (M/L, prezente, absente, X/16).
--
--  Acum, la transferul catre ALT profesor, se completeaza automat DOAR pozitia (acelasi camp
--  istoric pe care il seteaza adminul din Editeaza Elev):
--    - lesson_offset += lectiile efectuate (prezent/recuperat) vizibile la vechiul profesor
--  Se scad randurile deja vizibile la NOUL profesor (cazul rar al unui elev intors la un
--  profesor la care a mai fost) - altfel ar fi numarate de doua ori.
--  NU se ating: presence_count, absence_count, progress, legacy_module_stars /
--  legacy_stars_module - le seteaza adminul din Editeaza Elev.
--  Ce s-a adus se salveaza in tracker_student_transfers (carried_lessons), pentru audit.
--  Transferul intre doua clase ale ACELUIASI profesor ramane neschimbat (prezentele raman
--  vizibile, nu se aduna nimic).
-- ============================================================================

alter table public.tracker_student_transfers add column if not exists carried_lessons int;

create or replace function public.transfer_student_teacher(
  p_student_id uuid, p_new_teacher_id uuid, p_new_group_id uuid, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old_teacher_id uuid;
  v_old_group_id uuid;
  v_student public.tracker_students%rowtype;
  v_done_old int := 0; v_done_new int := 0;
  v_carried_lessons int;
begin
  if not public.is_admin() then
    raise exception 'Doar administratorii pot transfera un elev.';
  end if;
  select * into v_student from public.tracker_students where id = p_student_id;
  v_old_teacher_id := v_student.teacher_id;
  v_old_group_id := v_student.group_id;
  if v_old_teacher_id is null then
    raise exception 'Elevul nu a fost găsit.';
  end if;
  if not exists (
    select 1 from public.tracker_groups where id = p_new_group_id and teacher_id = p_new_teacher_id and deleted_at is null
  ) then
    raise exception 'Clasa aleasă nu aparține profesorului ales.';
  end if;
  if v_old_teacher_id = p_new_teacher_id and v_old_group_id = p_new_group_id then
    return;
  end if;

  if v_old_teacher_id <> p_new_teacher_id then
    -- Ce vede Progress Tracker inainte (randurile vechiului profesor) si dupa (randurile noului).
    select count(*) filter (where teacher_id = v_old_teacher_id and status in ('present', 'made_up')),
           count(*) filter (where teacher_id = p_new_teacher_id and status in ('present', 'made_up'))
      into v_done_old, v_done_new
      from public.tracker_attendance where student_id = p_student_id;

    v_carried_lessons := v_done_old - v_done_new;

    update public.tracker_students
      set lesson_offset = lesson_offset + v_carried_lessons
      where id = p_student_id;
  end if;

  update public.tracker_students
    set teacher_id = p_new_teacher_id, group_id = p_new_group_id
    where id = p_student_id;
  insert into public.tracker_student_transfers
    (student_id, from_teacher_id, to_teacher_id, from_group_id, to_group_id, transferred_by, note,
     carried_lessons)
  values (p_student_id, v_old_teacher_id, p_new_teacher_id, v_old_group_id, p_new_group_id, auth.uid(), p_note,
     v_carried_lessons);
end;
$$;

grant execute on function public.transfer_student_teacher(uuid, uuid, uuid, text) to authenticated;
