-- ============================================================================
--  Modulul steluțelor istorice (legacy_stars_module). Ruleaza acest fisier o singura data in
--  Supabase -> SQL Editor, INAINTE de a publica codul nou (pagina /progress citeste coloana
--  explicit) si INAINTE de supabase/repair/restore_module_stars_v2.sql.
--
--  Problema: in Editeaza Elev campul se numeste "Steluțe în modulul M{x}" cu x = modulul
--  POZITIEI CURENTE a elevului, dar cardul (si diploma) numarau legacy_module_stars in modulul
--  lui lesson_offset (pozitia de la intrare in Tracker). La copiii care au deja lectii in
--  Tracker cele doua difera (ex. intrat la M1/L10, acum la M2/L3) - steluțele se salvau, dar
--  nu apareau nicaieri (raportat la Horia Simbotin si Dima Androne Filip Ioan).
--  Acum modulul se salveaza explicit; NULL = elevi vechi -> ramane regula veche (lesson_offset).
-- ============================================================================

alter table public.tracker_students add column if not exists legacy_stars_module int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tracker_students_legacy_stars_module_range') then
    alter table public.tracker_students add constraint tracker_students_legacy_stars_module_range
      check (legacy_stars_module is null or legacy_stars_module >= 1);
  end if;
end $$;

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
    select s.id, s.name, s.short_name, s.teacher_id, s.group_id, s.pending_diploma_milestone, s.progress,
           s.lesson_offset, s.legacy_module_stars, s.legacy_stars_module
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
    -- Steluțele de pe diploma = STRICT temele din lectiile modulului diplomei (fiecare modul
    -- porneste de la 0), la fel ca contorul X/16 de pe Cardul Elevului din Progress Tracker
    -- (vezi moduleStarsFor in src/lib/lessonNumbering.ts). v_milestone / 16 = modulul real
    -- (ex. 80 -> 5, chiar daca sablonul folosit e cel al Modulului 4).
    -- + steluțele istorice (legacy_module_stars), doar daca pozitia manuala a elevului
    -- (lesson_offset) cade in modulul diplomei (vezi legacyStarsInModule). Modulul salvat
    -- explicit (legacy_stars_module) are prioritate - vezi add_tracker_legacy_stars_module.sql.
    select least(16, coalesce(sum(a.star_count), 0)
        + case when coalesce(v_student.legacy_stars_module,
                             (greatest(v_student.lesson_offset, 1) - 1) / 16 + 1) = v_milestone / 16
               then v_student.legacy_module_stars else 0 end)::int
      into v_stars
      from public.tracker_attendance a
      join public.tracker_lessons l on l.id = a.lesson_id
      where a.student_id = p_student_id and l.group_id = v_student.group_id
        and l.curriculum_index between (v_milestone / 16 - 1) * 16 + 1 and (v_milestone / 16) * 16;
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
