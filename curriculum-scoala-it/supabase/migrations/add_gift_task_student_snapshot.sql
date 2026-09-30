-- ============================================================================
--  CADOURI ("🪙 Trimite monedele virtuale") - NUMELE COPILULUI INDEPENDENT DE DIPLOMA
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor (dupa
--  add_feedback_templates.sql). Continutul e adaugat si in schema.sql.
--
--  Bug raportat: in Task-uri Urgente -> "🎁 Cadouri", numele copilului aparea "Elev șters".
--  Cauza: task-ul SEND_VIRTUAL_COINS era inserat FARA snapshot de nume (doar DIPLOMA_GENERATED
--  avea diploma_student_name). Pentru un elev "Manual" (student_id NULL - inclusiv o generare
--  Manual pornita dintr-un task real) nu exista niciun rand in tracker_students de unde sa se
--  citeasca numele live, deci attachUrgentTaskDetails (lib/urgentTasks.ts) cadea pe fallback-ul
--  "Elev șters". Numele exista doar pe task-ul de diploma - care, odata finalizat, dispare din
--  Task-uri Urgente, iar cele doua task-uri nu mai aveau nimic in comun.
--
--  Solutia: task-ul de cadou primeste propriul snapshot (diploma_student_name +
--  diploma_course_id - aceleasi coloane, fara coloane noi), scris direct la creare, astfel incat
--  sa nu mai depinda sub nicio forma de statusul/existenta task-ului de diploma. Task-urile de
--  cadou existente fara nume sunt completate o singura data (backfill) mai jos.
--
--  Izolat: NU modifica logica de stelute/prezente, pragurile de diploma, rollback-ul sau
--  task-ul DIPLOMA_GENERATED - singura diferenta in functie e INSERT-ul task-ului de cadou.
-- ============================================================================

create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null,
  p_manual_student_name text default null,
  p_manual_course_id text default null,
  p_manual_stars int default null,
  p_manual_total_stars int default null,
  p_origin_student_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student record;
  v_group record;
  v_teacher_name text;
  v_teacher_id uuid;
  v_milestone int;
  v_first_name text;
  v_reward_type text;
  v_reward_details text;
  v_student_name text;
  v_course_id text;
  v_stars int;
  v_total_stars int;
begin
  if p_module is null or p_module < 1 then
    raise exception 'Modul invalid.';
  end if;

  if p_reward_received then
    if p_reward_type is null or p_reward_type not in ('virtual_money', 'super_power') then
      raise exception 'Tip de premiu invalid.';
    end if;
    if nullif(trim(coalesce(p_reward_details, '')), '') is null then
      raise exception 'Detaliile premiului sunt obligatorii.';
    end if;
    v_reward_type := p_reward_type;
    v_reward_details := trim(p_reward_details);
  else
    v_reward_type := null;
    v_reward_details := null;
  end if;

  v_milestone := p_module * 16;

  if p_student_id is not null then
    select s.id, s.name, s.short_name, s.teacher_id, s.group_id, s.pending_diploma_milestone, s.progress
      into v_student
      from public.tracker_students s
      where s.id = p_student_id and (s.teacher_id = auth.uid() or public.is_admin())
      for update;

    if v_student.id is null then
      raise exception 'Elevul nu a fost găsit.';
    end if;

    v_first_name := coalesce(nullif(trim(v_student.short_name), ''), split_part(v_student.name, ' ', 1));
    select group_name, course into v_group from public.tracker_groups where id = v_student.group_id;

    if v_student.pending_diploma_milestone = v_milestone then
      update public.tracker_students
        set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
        where id = p_student_id;
    end if;

    v_student_name := v_student.name;
    v_course_id := v_group.course;
    v_stars := case when v_student.progress > 0 and v_student.progress % 16 = 0 then 16 else v_student.progress % 16 end;
    v_total_stars := v_student.progress;
    v_teacher_id := v_student.teacher_id;
  else
    -- Elev "Manual": nimic de citit/actualizat in tracker_students - profesorul a introdus
    -- numele/cursul/stelutele direct din formular (nu are cont in aplicatie).
    if nullif(trim(coalesce(p_manual_student_name, '')), '') is null then
      raise exception 'Numele elevului este obligatoriu.';
    end if;
    v_student_name := trim(p_manual_student_name);
    v_first_name := split_part(v_student_name, ' ', 1);
    v_course_id := p_manual_course_id;
    v_stars := greatest(0, least(16, coalesce(p_manual_stars, 0)));
    v_total_stars := greatest(0, coalesce(p_manual_total_stars, 0));
    v_teacher_id := auth.uid();

    if p_origin_student_id is not null then
      update public.tracker_students
        set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
        where id = p_origin_student_id
          and (teacher_id = auth.uid() or public.is_admin())
          and pending_diploma_milestone = v_milestone;
    end if;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_teacher_name
    from public.profiles p where p.id = v_teacher_id;

  -- Task 1 - "🎓 Trimite diploma părintelui": mereu creat, indiferent de recompensa.
  insert into public.urgent_tasks
    (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, parent_message,
     diploma_student_name, diploma_teacher_name, diploma_course_id, diploma_date, diploma_stars, diploma_total_stars,
     milestone_reached_at)
  values (
    'DIPLOMA_GENERATED', p_student_id, v_teacher_id, v_milestone,
    p_reward_received, v_reward_type, v_reward_details,
    public.random_diploma_parent_message(p_student_id, v_first_name, v_course_id, p_module),
    v_student_name, v_teacher_name, v_course_id, p_diploma_date,
    v_stars, v_total_stars,
    now()
  )
  on conflict (student_id, milestone, type) do nothing;

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali. Are propriul
  -- snapshot de nume/curs, ca sa afiseze copilul si fara student_id (elev "Manual") si
  -- indiferent de statusul task-ului de diploma.
  if p_reward_received and p_reward_type = 'virtual_money' then
    insert into public.urgent_tasks
      (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details,
       diploma_student_name, diploma_course_id, milestone_reached_at)
    values (
      'SEND_VIRTUAL_COINS', p_student_id, v_teacher_id, v_milestone,
      true, 'virtual_money', v_reward_details,
      v_student_name, v_course_id,
      now()
    )
    on conflict (student_id, milestone, type) do nothing;
  end if;

  if p_student_id is not null then
    update public.urgent_tasks
      set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid()
      where student_id = p_student_id and milestone = v_milestone and type = 'DIPLOMA_NOT_SENT' and status <> 'COMPLETED';
  end if;
end;
$$;

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text, text, text, int, int, uuid) to authenticated;

-- Backfill 1: cadouri ale unui elev real (student_id setat) - numele/cursul live, la fel ca
-- restul task-urilor.
update public.urgent_tasks u
  set diploma_student_name = s.name,
      diploma_course_id = coalesce(u.diploma_course_id, g.course)
  from public.tracker_students s
  left join public.tracker_groups g on g.id = s.group_id
  where u.type = 'SEND_VIRTUAL_COINS'
    and u.diploma_student_name is null
    and u.student_id = s.id;

-- Backfill 2: cadouri ale unui elev "Manual" (student_id NULL) - numele se recupereaza din
-- task-ul de diploma creat IN ACEEASI tranzactie (finalize_diploma_with_reward): acelasi
-- profesor, acelasi prag si exact acelasi milestone_reached_at (now() e constant intr-o
-- tranzactie). Indiferent de statusul diplomei (NEW / IN_PROGRESS / COMPLETED).
update public.urgent_tasks u
  set diploma_student_name = d.diploma_student_name,
      diploma_course_id = coalesce(u.diploma_course_id, d.diploma_course_id)
  from public.urgent_tasks d
  where u.type = 'SEND_VIRTUAL_COINS'
    and u.diploma_student_name is null
    and u.student_id is null
    and d.type = 'DIPLOMA_GENERATED'
    and d.student_id is null
    and d.teacher_id is not distinct from u.teacher_id
    and d.milestone = u.milestone
    and d.milestone_reached_at = u.milestone_reached_at
    and d.diploma_student_name is not null;

notify pgrst, 'reload schema';
