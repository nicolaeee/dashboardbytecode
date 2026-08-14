-- ============================================================================
--  STATUS ELEV (Activ / Pauza / Abandon) + TRANSFER LA ALT PROFESOR
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Statusul e independent de transfer: un elev transferat la alt profesor
--  ramane 'active' (doar teacher_id/group_id se schimba) - transferul e o
--  mutare interna, NU se calculeaza ca abandon pentru scoala (vezi
--  public.teacher_dropout_stats, care numara doar status = 'dropped_out').
-- ============================================================================

alter table public.tracker_students
  add column status text not null default 'active'
    check (status in ('active', 'paused', 'dropped_out')),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id) on delete set null,
  add column status_note text;

create index on public.tracker_students (teacher_id, status);

-- ----------------------------------------------------------------------------
-- Audit transfer: cine a mutat elevul, de la ce profesor/clasa la ce profesor/clasa.
-- Istoricul de lectii/prezenta al elevului RAMANE legat de profesorul/clasa veche
-- (nu se cascadeaza, spre deosebire de transfer_class_teacher care muta o clasa
-- INTREAGA) - un transfer de elev individual muta doar elevul mai departe, intr-o
-- clasa a noului profesor; ce s-a intamplat inainte de transfer ramane istoric.
-- ----------------------------------------------------------------------------
create table public.tracker_student_transfers (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.tracker_students(id) on delete cascade,
  from_teacher_id uuid references public.profiles(id) on delete set null,
  to_teacher_id   uuid not null references public.profiles(id) on delete cascade,
  from_group_id   uuid references public.tracker_groups(id) on delete set null,
  to_group_id     uuid not null references public.tracker_groups(id) on delete cascade,
  transferred_by  uuid references public.profiles(id) on delete set null,
  transferred_at  timestamptz not null default now(),
  note            text
);

create index on public.tracker_student_transfers (student_id);
create index on public.tracker_student_transfers (to_teacher_id);

alter table public.tracker_student_transfers enable row level security;

create policy "adminul vede si gestioneaza transferurile" on public.tracker_student_transfers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Transfera UN elev la alt profesor (grupa noua a acelui profesor) - rezervat
-- adminului, la fel ca transfer_class_teacher. Spre deosebire de acea functie,
-- NU cascadeaza pe tracker_lessons/tracker_attendance - istoricul ramane atasat
-- vechii clase/profesor, doar elevul (tracker_students) se muta mai departe.
-- ----------------------------------------------------------------------------
create or replace function public.transfer_student_teacher(
  p_student_id uuid, p_new_teacher_id uuid, p_new_group_id uuid, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_teacher_id uuid;
  v_old_group_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Doar administratorii pot transfera un elev.';
  end if;

  select teacher_id, group_id into v_old_teacher_id, v_old_group_id
    from public.tracker_students where id = p_student_id;
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

  update public.tracker_students
    set teacher_id = p_new_teacher_id, group_id = p_new_group_id
    where id = p_student_id;

  insert into public.tracker_student_transfers
    (student_id, from_teacher_id, to_teacher_id, from_group_id, to_group_id, transferred_by, note)
  values (p_student_id, v_old_teacher_id, p_new_teacher_id, v_old_group_id, p_new_group_id, auth.uid(), p_note);
end;
$$;

grant execute on function public.transfer_student_teacher(uuid, uuid, uuid, text) to authenticated;
