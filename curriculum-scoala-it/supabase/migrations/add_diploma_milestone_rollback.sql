-- Rollback pentru pragul de diploma (16/32/48 prezente), pentru cazul in care profesorul
-- anuleaza din greseala o prezenta (Prezent/Recuperat -> Absent) care tocmai a declansat acel
-- prag. Reface starea exact ca inainte de a se fi atins pragul:
--   - sterge orice task de admin NEFINALIZAT (Task-uri Urgente: DIPLOMA_GENERATED,
--     DIPLOMA_NOT_SENT, SEND_VIRTUAL_COINS) creat pentru acel prag;
--   - reseteaza pending_diploma_milestone / last_diploma_issued_milestone la valoarea
--     anterioara (ex. de la 32 inapoi la 16), ca sistemul sa ceara din nou pragul.
-- NU atinge NICIODATA un task deja COMPLETED (diploma sau monedele au fost deja trimise
-- efectiv de admin) - in acel caz functia intoarce already_sent = true si NU sterge/reseteaza
-- nimic; clientul (ProgressTracker) las- starea diplomei neschimbata, doar prezenta se
-- corecteaza. Security definer, ca finalize_diploma_with_reward, pentru ca teacherii nu au
-- drept de citire/stergere pe urgent_tasks (RLS: "adminul gestioneaza task-urile urgente").
create or replace function public.rollback_diploma_milestone(p_student_id uuid, p_milestone int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_already_sent boolean;
begin
  select id, pending_diploma_milestone, last_diploma_issued_milestone
    into v_student
    from public.tracker_students
    where id = p_student_id and (teacher_id = auth.uid() or public.is_admin())
    for update;

  if v_student.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_milestone is null or p_milestone <= 0 or p_milestone % 16 <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_milestone');
  end if;

  select exists(
    select 1 from public.urgent_tasks
    where student_id = p_student_id and milestone = p_milestone
      and type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS')
      and status = 'COMPLETED'
  ) into v_already_sent;

  if v_already_sent then
    return jsonb_build_object('ok', true, 'already_sent', true);
  end if;

  delete from public.urgent_tasks
    where student_id = p_student_id and milestone = p_milestone
      and type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS')
      and status <> 'COMPLETED';

  update public.tracker_students
    set
      pending_diploma_milestone = case when pending_diploma_milestone = p_milestone then null else pending_diploma_milestone end,
      last_diploma_issued_milestone = case when last_diploma_issued_milestone = p_milestone then p_milestone - 16 else last_diploma_issued_milestone end
    where id = p_student_id
    returning id, pending_diploma_milestone, last_diploma_issued_milestone into v_student;

  return jsonb_build_object(
    'ok', true, 'already_sent', false,
    'pending_diploma_milestone', v_student.pending_diploma_milestone,
    'last_diploma_issued_milestone', v_student.last_diploma_issued_milestone
  );
end;
$$;

grant execute on function public.rollback_diploma_milestone(uuid, int) to authenticated;
