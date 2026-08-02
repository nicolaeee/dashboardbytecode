-- ============================================================================
--  TRANSFER CLASA INTRE PROFESORI (Panoul Admin -> Editeaza Clasa)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  De ce o functie SQL si nu 4 UPDATE-uri separate din server action:
--  tracker_students / tracker_lessons / tracker_attendance au fiecare propria
--  coloana teacher_id (denormalizata, nu doar derivata prin group_id - vezi
--  schema.sql sectiunea 9), iar fetch-urile din aplicatie filtreaza direct pe
--  acel teacher_id, nu printr-un join. Daca am actualiza doar tracker_groups,
--  elevii/lectiile/prezenta ar ramane cu teacher_id-ul vechi -> ar deveni
--  invizibili si pentru vechiul, si pentru noul profesor ("orfani"). Cele 4
--  UPDATE-uri trebuie sa reuseasca impreuna sau deloc - o functie plpgsql ruleaza
--  intr-o singura tranzactie implicita, deci un esec pe oricare update face
--  rollback la toate.
-- ============================================================================

create or replace function public.transfer_class_teacher(p_group_id uuid, p_new_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_teacher_id uuid;
begin
  -- Aparare in adancime: chiar daca functia e apelata direct (nu prin server
  -- action-ul care deja verifica rolul), tot nu poate rula decat pentru admin.
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
  update public.tracker_lessons set teacher_id = p_new_teacher_id where group_id = p_group_id;
  update public.tracker_attendance set teacher_id = p_new_teacher_id
    where lesson_id in (select id from public.tracker_lessons where group_id = p_group_id);
end;
$$;

grant execute on function public.transfer_class_teacher(uuid, uuid) to authenticated;
