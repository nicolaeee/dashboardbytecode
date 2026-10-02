-- ============================================================================
--  FIX: taskul "🎓 Diplomă necesară" nu disparea dupa generarea diplomei (raportat pentru
--  Puscasu Bogdan, verificat pentru toti profesorii).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Cauza: pragul de diploma (pending_diploma_milestone) = numarul total de prezente, multiplu
--  de 16 - poate fi 80, 96, ... (elevi trecuti de Modulul 4). Exista sabloane de diploma doar
--  pentru Modulele 1-4, deci Diplome.tsx limiteaza modulul la 4. finalize_diploma_with_reward
--  inchidea taskul DOAR daca p_module*16 == prag (4*16 = 64 != 80) -> diploma se genera, taskul
--  pentru admin se crea, dar taskul profesorului ramanea deschis la nesfarsit.
--
--  Fix: aceeasi regula de limitare si in SQL (diploma_module_for_milestone), plus reparatia
--  elevilor deja blocati (la final). Nimic altceva nu se schimba in functie.
-- ============================================================================

-- Modulul de diploma pentru un prag de prezente: 16 -> 1, 32 -> 2, 48 -> 3, 64+ -> 4 (ultimul
-- sablon existent - vezi DIPLOMA_MODULES in src/lib/diplomas.ts). null -> null.
create or replace function public.diploma_module_for_milestone(p_milestone int)
returns int language sql immutable as $$
  select case when p_milestone is null or p_milestone < 1 then null
              else least((p_milestone - 1) / 16 + 1, 4) end;
$$;


-- p_student_id NULL = elev "Manual" (fara cont in tracker_students, mod "Manual" din Diplome.tsx)
-- - profesorul NU trebuie sa vada/descarce diploma direct in acest caz (aceeasi regula ca la un
-- elev real - decizie explicita de business), deci si un elev Manual trece prin acelasi task
-- pentru admin, folosind STRICT parametrii p_manual_* (nimic de citit din tracker_students).
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null,
  p_manual_student_name text default null,
  p_manual_course_id text default null,
  p_manual_stars int default null,
  p_manual_total_stars int default null,
  -- Elevul REAL din spatele unei generari Manual pornite dintr-un task real (Task-uri Urgente ->
  -- "🎓 Generează Diplomă" -> profesorul comuta pe "Manual" ca sa editeze numele/stelutele).
  -- Diploma insasi ramane legata de datele manuale (student_id NULL mai sus), dar pragul lui de
  -- prezente TREBUIE inchis la fel ca la o generare normala - altfel taskul lui ramane agatat la
  -- nesfarsit, desi diploma (cu datele editate) a fost deja trimisa catre admin. Ignorat cand
  -- p_student_id nu e null (nu are sens sa existe amandoi deodata).
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
  v_origin_pending int;
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

    -- Pragul deschis se inchide daca modulul diplomei corespunde pragului, cu aceeasi limitare
    -- la ultimul sablon (Modulul 4) ca in Diplome.tsx: un prag de 80/96/... prezente (M5+) se
    -- genereaza pe sablonul Modulului 4 - inainte, 4*16=64 != 80 si taskul ramanea agatat.
    -- Taskul pentru admin primeste pragul REAL (ex. 80), nu 64, ca sa nu se ciocneasca cu
    -- diploma deja trimisa la 64 (unique student_id+milestone+type).
    if public.diploma_module_for_milestone(v_student.pending_diploma_milestone) = p_module then
      v_milestone := v_student.pending_diploma_milestone;
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

    -- Inchide pragul elevului REAL de origine, daca exista si chiar mai are deschis EXACT acest
    -- prag (aceeasi conditie de siguranta ca la elevul real de mai sus - nu inchidem orbeste un
    -- prag care nu mai corespunde, ex. elevul a mai avansat intre timp).
    if p_origin_student_id is not null then
      select pending_diploma_milestone into v_origin_pending from public.tracker_students
        where id = p_origin_student_id and (teacher_id = auth.uid() or public.is_admin());
      if public.diploma_module_for_milestone(v_origin_pending) = p_module then
        v_milestone := v_origin_pending;
        update public.tracker_students
          set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
          where id = p_origin_student_id and pending_diploma_milestone = v_origin_pending;
      end if;
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

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali. Task
  -- independent (status propriu), fara mesaj pentru parinte si fara butoane de diploma (vezi
  -- TaskUriUrgenteClient.tsx). Are propriul snapshot de nume/curs (vezi
  -- add_gift_task_student_snapshot.sql) - afiseaza copilul si fara student_id (elev "Manual")
  -- si indiferent de statusul task-ului de diploma. Idempotent ca si task-ul 1, prin acelasi
  -- unique (student_id, milestone, type).
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

-- ----------------------------------------------------------------------------
-- Reparatie: elevii deja blocati - au un prag deschis, dar diploma pentru el a fost DEJA
-- generata (exista taskul DIPLOMA_GENERATED pentru modulul corespunzator, creat dupa ce elevul
-- a atins pragul). Doar acestia sunt inchisi; orice alt prag deschis ramane neatins.
-- ----------------------------------------------------------------------------
update public.tracker_students s
set last_diploma_issued_milestone = s.pending_diploma_milestone, pending_diploma_milestone = null
where s.pending_diploma_milestone is not null
  and exists (
    select 1 from public.urgent_tasks t
    where t.student_id = s.id and t.type = 'DIPLOMA_GENERATED'
      and public.diploma_module_for_milestone(t.milestone) = public.diploma_module_for_milestone(s.pending_diploma_milestone)
      and t.created_at >= coalesce(s.pending_diploma_milestone_at, '-infinity'::timestamptz)
  );

-- Verificare (toti profesorii): taskurile de diploma care raman deschise dupa reparatie.
-- "diploma_generata_dupa" = da -> s-a generat o diploma DUPA prag, dar pentru alt modul decat
-- cel cuvenit (alegere gresita in formular) - profesorul trebuie sa o regenereze pe modulul corect.
select coalesce(p.full_name, p.email) as profesor, s.name as elev, s.pending_diploma_milestone as prag,
       public.diploma_module_for_milestone(s.pending_diploma_milestone) as modul_diploma,
       to_char(s.pending_diploma_milestone_at, 'DD.MM.YYYY') as deschis_la,
       case when exists (
         select 1 from public.urgent_tasks t
         where t.student_id = s.id and t.type = 'DIPLOMA_GENERATED'
           and t.created_at >= coalesce(s.pending_diploma_milestone_at, '-infinity'::timestamptz)
       ) then 'da' else 'nu' end as diploma_generata_dupa
from public.tracker_students s
left join public.profiles p on p.id = s.teacher_id
where s.pending_diploma_milestone > 0 and s.deleted_at is null
order by profesor, elev;
