-- ============================================================================
--  ELIMINA CAMPUL "NUMAR MONEDE" DE LA FINALIZAREA DIPLOMEI
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor (dupa
--  add_virtual_coins_task.sql).
--
--  Profesorul nu mai introduce numarul de monede virtuale la finalizarea diplomei -
--  alege doar tipul de premiu ("Monede virtuale" / "Superputere") si detaliile
--  (camp text liber, existent deja). Task-ul "🪙 Trimite monedele virtuale" pentru
--  admin se creeaza in continuare doar pe baza faptului ca profesorul a ales
--  "Monede virtuale" - fara sa afiseze/ceara o cantitate.
--
--  Izolat: nu atinge restul fluxului de diploma (superputere / fara premiu), nu
--  recreeaza tabela urgent_tasks - doar elimina coloana coin_amount si constrangerea
--  ei, si reface finalize_diploma_with_reward fara parametrul p_coin_amount.
-- ============================================================================

alter table public.urgent_tasks drop constraint if exists urgent_tasks_coin_amount_check;
alter table public.urgent_tasks drop column if exists coin_amount;

-- Semnatura scade de la 7 la 6 parametri -> pentru Postgres e o functie diferita,
-- stergem explicit versiunea veche (acelasi tipar ca la introducerea coin_amount).
drop function if exists public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text, int);
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student record;
  v_group record;
  v_teacher_name text;
  v_milestone int;
  v_first_name text;
  v_course_label text;
  v_reward_type text;
  v_reward_details text;
begin
  select s.id, s.name, s.short_name, s.teacher_id, s.group_id, s.pending_diploma_milestone, s.progress
    into v_student
    from public.tracker_students s
    where s.id = p_student_id and (s.teacher_id = auth.uid() or public.is_admin())
    for update;

  if v_student.id is null then
    raise exception 'Elevul nu a fost găsit.';
  end if;
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
  v_first_name := coalesce(nullif(trim(v_student.short_name), ''), split_part(v_student.name, ' ', 1));

  select group_name, course into v_group from public.tracker_groups where id = v_student.group_id;
  v_course_label := coalesce(
    case v_group.course
      when 'coblocks' then 'Blocuri de cod'
      when 'python' then 'Python'
      when 'roblox' then 'Roblox'
      when 'alfabetizare' then 'Alfabetizare'
      when 'unity' then 'Unity'
      else v_group.course
    end,
    'IT'
  );

  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_teacher_name
    from public.profiles p where p.id = v_student.teacher_id;

  if v_student.pending_diploma_milestone = v_milestone then
    update public.tracker_students
      set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
      where id = p_student_id;
  end if;

  -- Task 1 - "🎓 Trimite diploma părintelui": mereu creat, indiferent de recompensa.
  insert into public.urgent_tasks
    (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, parent_message,
     diploma_student_name, diploma_teacher_name, diploma_course_id, diploma_date, diploma_stars, diploma_total_stars,
     milestone_reached_at)
  values (
    'DIPLOMA_GENERATED', p_student_id, v_student.teacher_id, v_milestone,
    p_reward_received, v_reward_type, v_reward_details,
    public.random_diploma_parent_message(v_first_name, v_course_label),
    v_student.name, v_teacher_name, v_group.course, p_diploma_date,
    case when v_student.progress > 0 and v_student.progress % 16 = 0 then 16 else v_student.progress % 16 end,
    v_student.progress,
    now()
  )
  on conflict (student_id, milestone, type) do nothing;

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali, creat
  -- exclusiv pe baza faptului ca profesorul a ales "Monede virtuale" - fara nicio cantitate.
  if p_reward_received and p_reward_type = 'virtual_money' then
    insert into public.urgent_tasks
      (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, milestone_reached_at)
    values (
      'SEND_VIRTUAL_COINS', p_student_id, v_student.teacher_id, v_milestone,
      true, 'virtual_money', v_reward_details,
      now()
    )
    on conflict (student_id, milestone, type) do nothing;
  end if;

  update public.urgent_tasks
    set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid()
    where student_id = p_student_id and milestone = v_milestone and type = 'DIPLOMA_NOT_SENT' and status <> 'COMPLETED';
end;
$$;

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text) to authenticated;
