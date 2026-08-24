-- ============================================================================
--  SNAPSHOT AL DIPLOMEI IN URGENT_TASKS
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Diploma nu e un fisier binar generat/stocat - e un sablon HTML static din public/diplome/
--  deschis cu parametri in URL (elev, profesor, curs, data, stelute, totalStelute). Pana acum,
--  butonul "Descarcă diploma" al adminului (TaskUriUrgenteClient.tsx) reconstruia acest URL din
--  date LIVE - data curenta si progresul curent al elevului - ceea ce insemna ca diploma putea
--  arata diferit (data gresita, alt numar de stelute) fata de ce a vazut profesorul, daca adminul
--  o deschidea in alta zi sau elevul progresa intre timp.
--
--  Aceasta migrare ingheata exact acei parametri in urgent_tasks, la momentul
--  "Finalizeaza generarea diplomei" (finalize_diploma_with_reward) - admin-ul reconstruieste
--  acum URL-ul diplomei din acest snapshot, nu din date live. Null pentru DIPLOMA_NOT_SENT
--  (diploma inca nu exista in acel caz).
--
--  Nu modifica designul/sablonul diplomei si nu introduce Supabase Storage - ramane acelasi
--  mecanism (sablon HTML + query string), doar cu parametrii inghetati.
-- ============================================================================

-- IF NOT EXISTS pe fiecare coloana - sigur de rulat din nou daca acest fisier a mai fost
-- executat partial (ex. a picat la jumatate).
alter table public.urgent_tasks add column if not exists diploma_student_name text;
alter table public.urgent_tasks add column if not exists diploma_teacher_name text;
alter table public.urgent_tasks add column if not exists diploma_course_id    text;
alter table public.urgent_tasks add column if not exists diploma_date         text;
alter table public.urgent_tasks add column if not exists diploma_stars        int;
alter table public.urgent_tasks add column if not exists diploma_total_stars  int;

-- Adauga p_diploma_date (parametru nou) si ingheata numele elevului/profesorului/cursul/
-- steluțele la momentul finalizarii. IMPORTANT: schimbarea listei de parametri (5 -> 6) face
-- din asta, pentru Postgres, o functie DIFERITA (overload nou) - "create or replace" NU
-- inlocuieste vechea versiune de 5 parametri, doar adauga una noua alaturi. O stergem explicit
-- mai jos, altfel raman doua versiuni in baza de date (fara efect functional imediat, pentru ca
-- PostgREST alege oricum versiunea care se potriveste exact cu parametrii trimisi de client -
-- dar e curatenie necesara).
drop function if exists public.finalize_diploma_with_reward(uuid, int, boolean, text, text);
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student record;
  v_group record;
  v_milestone int;
  v_first_name text;
  v_course_label text;
  v_reward_type text;
  v_reward_details text;
  v_teacher_name text;
  v_stars int;
  v_total_stars int;
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

  v_total_stars := v_student.progress;
  v_stars := case when v_student.progress > 0 and v_student.progress % 16 = 0 then 16 else v_student.progress % 16 end;

  if v_student.pending_diploma_milestone = v_milestone then
    update public.tracker_students
      set last_diploma_issued_milestone = v_milestone, pending_diploma_milestone = null
      where id = p_student_id;
  end if;

  insert into public.urgent_tasks
    (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, parent_message,
     diploma_student_name, diploma_teacher_name, diploma_course_id, diploma_date, diploma_stars, diploma_total_stars,
     milestone_reached_at)
  values (
    'DIPLOMA_GENERATED', p_student_id, v_student.teacher_id, v_milestone,
    p_reward_received, v_reward_type, v_reward_details,
    public.random_diploma_parent_message(v_first_name, v_course_label),
    v_student.name, v_teacher_name, v_group.course, p_diploma_date, v_stars, v_total_stars,
    now()
  )
  on conflict (student_id, milestone, type) do nothing;

  update public.urgent_tasks
    set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid()
    where student_id = p_student_id and milestone = v_milestone and type = 'DIPLOMA_NOT_SENT' and status <> 'COMPLETED';
end;
$$;

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text) to authenticated;

-- Fortam PostgREST sa reincarce schema imediat, altfel coloanele diploma_* nou adaugate mai sus
-- pot lipsi din raspunsul lui `select('*')` cateva minute pana la urmatoarea reincarcare automata
-- (cache stale dupa ALTER TABLE) - simptom: task-ul are premiul/mesajul, dar nu si diploma.
notify pgrst, 'reload schema';
