-- ============================================================================
--  TASK SEPARAT PENTRU MONEDE VIRTUALE
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor (dupa
--  add_urgent_tasks.sql si add_diploma_snapshot_to_urgent_tasks.sql).
--
--  Cand profesorul finalizeaza o diploma cu recompensa "Bani virtuali", se creeaza acum DOUA
--  task-uri INDEPENDENTE pentru admin, cu statusuri separate:
--   - DIPLOMA_GENERATED ("🎓 Trimite diploma părintelui") - neschimbat structural, doar mesajul
--     pentru parinte a fost extins cu ideea ca diploma e atasata (vezi random_diploma_parent_
--     message mai jos) - fara sa mentioneze recompensa;
--   - SEND_VIRTUAL_COINS ("🪙 Trimite monedele virtuale") - task nou, DOAR pentru admin, cu
--     numarul exact de monede introdus de profesor (niciodata presupus/inventat) - fara mesaj
--     pentru parinte, fara butoane de diploma.
--
--  Pentru "Superputere" si "Fara premiu" comportamentul ramane exact ca inainte - un singur
--  task (DIPLOMA_GENERATED).
--
--  Izolat: nu modifica tracker_students/tracker_groups, mecanismul de 16 prezente sau
--  DIPLOMA_NOT_SENT. Nu recreeaza tabela urgent_tasks - doar o extinde (coloana noua +
--  constrangere extinsa pe `type`).
-- ============================================================================

alter table public.urgent_tasks add column if not exists coin_amount int;

-- Extinde constrangerea pe `type` cu noua valoare 'SEND_VIRTUAL_COINS'. Numele
-- 'urgent_tasks_type_check' e cel generat automat de Postgres pentru constrangerea CHECK
-- inline, fara nume explicit, definita pe coloana `type` in create table (vezi
-- add_urgent_tasks.sql) - conventia standard Postgres: "<tabel>_<coloana>_check".
alter table public.urgent_tasks drop constraint if exists urgent_tasks_type_check;
alter table public.urgent_tasks add constraint urgent_tasks_type_check
  check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS'));

-- Numarul de monede e obligatoriu DOAR pe task-ul de monede - nu presupunem/inventam valoarea
-- (profesorul il introduce explicit in Diplome.tsx).
alter table public.urgent_tasks drop constraint if exists urgent_tasks_coin_amount_check;
alter table public.urgent_tasks add constraint urgent_tasks_coin_amount_check
  check (type <> 'SEND_VIRTUAL_COINS' or coin_amount is not null);

-- Mesaj de felicitare pentru parinte - aceleasi 8 variante calde de pana acum, extinse cu
-- ideea ca diploma e atasata ("📎 Vă atașăm diploma lui ... pentru această frumoasă reușită.")
-- - ceruta explicit pentru toate cele 3 cazuri de recompensa (fara premiu / superputere /
-- monede virtuale). Recompensa NU e mentionata niciodata aici - ramane vizibila DOAR
-- adminului, pe task-uri separate de urgent_tasks. Semnatura neschimbata (p_first_name,
-- p_course_label) - "create or replace" e suficient, nu e nevoie de DROP.
create or replace function public.random_diploma_parent_message(p_first_name text, p_course_label text)
returns text language sql volatile as $$
  select (array[
    format('🎉 Felicitări, %1$s! Suntem tare mândri de el pentru această reușită! A finalizat cu succes o nouă etapă din aventura lui la %2$s și ne bucurăm enorm să îl vedem cum evoluează, învață și prinde tot mai multă încredere. 🌟

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Este o bucurie să îl avem alături de noi și abia așteptăm să vedem ce lucruri minunate va descoperi în continuare! 🚀', p_first_name, p_course_label),
    format('🌟 Vești minunate despre %1$s! A dus la capăt cu brio o nouă etapă din călătoria lui la %2$s. Suntem atât de mândri de progresul și determinarea lui! 🎉

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Mulțumim că ne sunteți alături - abia așteptăm să vedem ce va cuceri în continuare! 💫', p_first_name, p_course_label),
    format('🚀 %1$s tocmai a bifat un nou pas important la %2$s! Ne umple de bucurie să îl vedem cum crește, învață lucruri noi și capătă din ce în ce mai multă încredere în el. 🎉

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Suntem recunoscători că face parte din povestea noastră și abia așteptăm continuarea aventurii lui! 🌟', p_first_name, p_course_label),
    format('🎊 O reușită minunată pentru %1$s! A finalizat cu succes o nouă etapă la %2$s și e clar că progresul lui e uriaș. Suntem tare mândri de el! 🌈

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Mulțumim că sunteți alături de noi în această călătorie - urmează lucruri și mai frumoase! ✨', p_first_name, p_course_label),
    format('🌈 Vești superbe despre %1$s! A trecut cu bine de o nouă etapă din aventura lui la %2$s, iar entuziasmul și implicarea lui ne bucură enorm. 🎉

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Este o plăcere să îl vedem evoluând - abia așteptăm să vedem ce urmează! 🚀', p_first_name, p_course_label),
    format('✨ %1$s a mai făcut un pas mare înainte la %2$s! Suntem tare mândri de reușita lui și de tot progresul făcut până acum. 🎉

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Vă mulțumim că sunteți alături de noi în această călătorie - urmează lucruri minunate! 🌟', p_first_name, p_course_label),
    format('🎉 Ce reușită frumoasă pentru %1$s! A încheiat cu succes o nouă etapă la %2$s și îl vedem din ce în ce mai încrezător și entuziasmat. 🌟

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Ne bucurăm enorm să facem parte din parcursul lui - abia așteptăm continuarea! 🚀', p_first_name, p_course_label),
    format('🌟 Felicitări din suflet, %1$s! A dus la bun sfârșit o nouă etapă din aventura lui la %2$s, iar progresul lui ne umple de mândrie. 🎉

📎 Vă atașăm diploma lui %1$s pentru această frumoasă reușită.

Mulțumim că sunteți alături de noi - urmează multe momente minunate! ✨', p_first_name, p_course_label)
  ])[1 + floor(random() * 8)::int];
$$;

-- "Finalizează generarea diplomei" din Diplome.tsx - acum accepta si p_coin_amount (numarul
-- exact de monede virtuale introdus de profesor, obligatoriu STRICT cand p_reward_type =
-- 'virtual_money'). Semnatura se schimba (6 -> 7 parametri), deci pentru Postgres e o functie
-- DIFERITA (overload nou) - stergem explicit versiunea veche, la fel ca la modificarile
-- anterioare de semnatura (vezi add_diploma_snapshot_to_urgent_tasks.sql).
drop function if exists public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text);
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null, p_coin_amount int default null
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
    if p_reward_type = 'virtual_money' and (p_coin_amount is null or p_coin_amount <= 0) then
      raise exception 'Numărul de monede virtuale este obligatoriu.';
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

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali. Task
  -- independent (status propriu), fara mesaj pentru parinte si fara snapshot de diploma -
  -- nu are butoane de diploma (vezi TaskUriUrgenteClient.tsx). Idempotent ca si task-ul 1,
  -- prin acelasi unique (student_id, milestone, type).
  if p_reward_received and p_reward_type = 'virtual_money' then
    insert into public.urgent_tasks
      (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, coin_amount, milestone_reached_at)
    values (
      'SEND_VIRTUAL_COINS', p_student_id, v_student.teacher_id, v_milestone,
      true, 'virtual_money', v_reward_details, p_coin_amount,
      now()
    )
    on conflict (student_id, milestone, type) do nothing;
  end if;

  update public.urgent_tasks
    set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid()
    where student_id = p_student_id and milestone = v_milestone and type = 'DIPLOMA_NOT_SENT' and status <> 'COMPLETED';
end;
$$;

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text, int) to authenticated;
