-- ============================================================================
--  ISTORICUL LECTIILOR SUPRAVIETUIESTE TRANSFERULUI CLASEI INTRE PROFESORI
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.
--   Idempotent: sigur de rulat de mai multe ori.)
--
--  Bug-ul: transfer_class_teacher rescria teacher_id pe TOATE randurile din
--  tracker_lessons / tracker_attendance ale clasei - inclusiv lectiile deja tinute.
--  Registrul (/registru) filtreaza dupa acel teacher_id, deci lectiile tinute de
--  vechiul profesor dispareau din registrul lui si apareau (gresit) la noul profesor.
--  Nimic nu era sters fizic - randurile erau doar reatribuite.
--
--  Fix-ul: teacher_id ramane "proprietarul" curent (cine vede/editeaza clasa in
--  Progress Tracker - se muta in continuare la transfer, ca noul profesor sa vada
--  tot istoricul, steluțele si prezentele elevului). Coloana noua `taught_by` spune
--  cine a PREDAT efectiv lectia/recuperarea - se fixeaza la creare/marcare si NU se
--  mai schimba la transfer. Registrul (Payslip) se calculeaza STRICT dupa taught_by.
-- ============================================================================

alter table public.tracker_lessons
  add column if not exists taught_by uuid references public.profiles(id) on delete set null;
alter table public.tracker_attendance
  add column if not exists taught_by uuid references public.profiles(id) on delete set null;

-- Backfill: pentru clasele care nu au fost niciodata transferate, proprietarul curent e
-- chiar cel care a predat. Clasele deja transferate (ex. Andrei: David -> Bogdan) se
-- corecteaza separat cu supabase/repair/repair_transferred_class_history.sql.
-- Trigger-ul de updated_at e oprit pe durata backfill-ului: updated_at alimenteaza arhivarea
-- claselor inactive (archive_inactive_tracker_groups), iar backfill-ul nu e activitate reala.
update public.tracker_lessons set taught_by = teacher_id where taught_by is null;
alter table public.tracker_attendance disable trigger tracker_attendance_touch;
update public.tracker_attendance set taught_by = teacher_id where taught_by is null;
alter table public.tracker_attendance enable trigger tracker_attendance_touch;

create index if not exists tracker_lessons_taught_by_idx on public.tracker_lessons (taught_by);
create index if not exists tracker_attendance_taught_by_idx on public.tracker_attendance (taught_by, status);

-- Cine poate seta taught_by explicit: adminul sau o sesiune fara utilizator (SQL Editor /
-- service role). Un profesor NU il poate modifica printr-un request direct catre REST
-- (altfel si-ar putea atribui orele altcuiva in Payslip).
create or replace function public.can_override_taught_by()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin();
$$;

-- Lectie: la creare, taught_by = proprietarul de atunci (profesorul care o tine).
-- La update, taught_by e inghetat (doar adminul/SQL il poate corecta).
create or replace function public.tracker_lessons_set_taught_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.taught_by is null or not public.can_override_taught_by() then
      new.taught_by := new.teacher_id;
    end if;
  elsif new.taught_by is distinct from old.taught_by and not public.can_override_taught_by() then
    new.taught_by := old.taught_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tracker_lessons_taught_by on public.tracker_lessons;
create trigger tracker_lessons_taught_by before insert or update on public.tracker_lessons
  for each row execute function public.tracker_lessons_set_taught_by();

-- Prezenta: 'present'/'absent' apartin sedintei live -> taught_by = cine a predat lectia.
-- 'made_up' e o sedinta separata (recuperarea) -> taught_by = proprietarul clasei in momentul
-- marcarii (profesorul care a tinut recuperarea). Recalculat DOAR cand se schimba statusul -
-- o schimbare de teacher_id (transfer) sau de steluțe nu atinge istoricul.
create or replace function public.tracker_attendance_set_taught_by()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_explicit boolean;
begin
  v_explicit := public.can_override_taught_by() and new.taught_by is not null
    and (tg_op = 'INSERT' or new.taught_by is distinct from old.taught_by);

  if v_explicit then
    return new;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'made_up' then
      new.taught_by := new.teacher_id;
    else
      select coalesce(l.taught_by, l.teacher_id) into new.taught_by
        from public.tracker_lessons l where l.id = new.lesson_id;
    end if;
  else
    new.taught_by := old.taught_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tracker_attendance_taught_by on public.tracker_attendance;
create trigger tracker_attendance_taught_by before insert or update on public.tracker_attendance
  for each row execute function public.tracker_attendance_set_taught_by();

-- Transferul clasei: teacher_id (proprietarul) se muta in continuare pe toate cele 4 tabele -
-- noul profesor vede si continua clasa cu tot istoricul (contor, steluțe, prezente intacte).
-- taught_by NU se atinge pentru lectiile deja tinute; doar lectiile viitoare / inca netinute
-- (fara nicio prezenta 'present'/'made_up') trec la noul profesor, care le va preda.
create or replace function public.transfer_class_teacher(p_group_id uuid, p_new_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_teacher_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Doar administratorii pot transfera o clasă.';
  end if;

  if not exists (select 1 from public.profiles where id = p_new_teacher_id) then
    raise exception 'Profesorul ales nu există.';
  end if;

  select teacher_id into v_old_teacher_id from public.tracker_groups where id = p_group_id;
  if v_old_teacher_id is null then
    raise exception 'Clasa nu a fost găsită.';
  end if;

  if v_old_teacher_id = p_new_teacher_id then
    return;
  end if;

  update public.tracker_groups set teacher_id = p_new_teacher_id where id = p_group_id;
  update public.tracker_students set teacher_id = p_new_teacher_id where group_id = p_group_id;

  -- Lectiile programate in viitor, inca netinute, vor fi predate de noul profesor.
  update public.tracker_lessons l set teacher_id = p_new_teacher_id, taught_by = p_new_teacher_id
    where l.group_id = p_group_id
      and l.lesson_date >= current_date
      and not exists (
        select 1 from public.tracker_attendance a
        where a.lesson_id = l.id and a.status in ('present', 'made_up')
      );
  -- Restul (istoricul): doar proprietarul se muta, taught_by ramane neatins.
  update public.tracker_lessons set teacher_id = p_new_teacher_id
    where group_id = p_group_id and teacher_id <> p_new_teacher_id;

  -- Prezenta: doar proprietarul. Trigger-ul pastreaza taught_by (statusul nu se schimba).
  update public.tracker_attendance set teacher_id = p_new_teacher_id
    where lesson_id in (select id from public.tracker_lessons where group_id = p_group_id);
end;
$$;

grant execute on function public.transfer_class_teacher(uuid, uuid) to authenticated;

-- Datele pentru /registru (Payslip) ale unui profesor, dupa cine a PREDAT efectiv - nu dupa
-- proprietarul curent al clasei. security definer pentru ca, dupa un transfer, vechiul
-- profesor nu mai are acces RLS la clasa/elevii/lectiile pe care le-a predat; functia ii
-- intoarce strict ce ii trebuie registrului (nume elev/grupa, fara date de contact).
create or replace function public.get_teacher_registry(p_teacher_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if p_teacher_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Nu ai acces la registrul acestui profesor.';
  end if;

  with att as (
    select a.* from public.tracker_attendance a
    where a.taught_by = p_teacher_id and a.status in ('present', 'made_up')
  ),
  les as (
    -- Lectiile predate + lectiile originale ale recuperarilor tinute de profesor (doar pentru
    -- numele grupei; nu sunt platite ca lectii live - n-au prezenta 'present' a lui).
    select l.* from public.tracker_lessons l
    where l.taught_by = p_teacher_id
       or l.id in (select lesson_id from att where status = 'made_up')
  )
  select json_build_object(
    'lessons', coalesce((select json_agg(les) from les), '[]'::json),
    'attendance', coalesce((select json_agg(att) from att), '[]'::json),
    'students', coalesce((
      select json_agg(json_build_object('id', s.id, 'name', s.name))
      from public.tracker_students s where s.id in (select student_id from att)
    ), '[]'::json),
    'groups', coalesce((
      select json_agg(json_build_object('id', g.id, 'group_name', g.group_name))
      from public.tracker_groups g where g.id in (select group_id from les)
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_teacher_registry(uuid) to authenticated;
