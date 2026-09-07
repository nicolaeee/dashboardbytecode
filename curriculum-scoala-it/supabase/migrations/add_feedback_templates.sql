-- ============================================================================
--  ȘABLOANE FEEDBACK DIPLOMĂ (CMS Admin) - "Șabloane Feedback"
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  Muta mesajele catre parinte (trimise la fiecare "Genereaza Diploma") dintr-un array
--  hardcodat in random_diploma_parent_message (10 variante generice, comune tuturor
--  cursurilor - vezi update_diploma_parent_message_variants.sql) intr-o tabela editabila
--  din Admin, cu CATE 3 variante per curs + modul (5 cursuri x 4 module x 3 variante = 60
--  randuri). Placeholder-ul [Numele Copilului] din text e inlocuit automat cu prenumele
--  elevului la generare - vezi random_diploma_parent_message mai jos.
--
--  RLS strict admin (profesorii nu pot citi/scrie tabela direct), dar functia SQL care
--  alege textul la generarea diplomei (random_diploma_parent_message) ruleaza security
--  definer, deci profesorul care apasa "Genereaza Diploma" tot primeste textul corect,
--  fara sa vada niciodata cele 3 variante brute - experienta lui ramane 1-click, neschimbata.
-- ============================================================================

create table public.feedback_templates (
  id             uuid primary key default gen_random_uuid(),
  course_id      text not null,
  module_number  int not null check (module_number between 1 and 4),
  variant_index  smallint not null check (variant_index between 0 and 2),
  message_text   text not null default '',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  unique (course_id, module_number, variant_index)
);

create index on public.feedback_templates (course_id, module_number);

alter table public.feedback_templates enable row level security;

create policy "adminul gestioneaza sabloanele de feedback" on public.feedback_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists feedback_templates_touch_updated_at on public.feedback_templates;
create trigger feedback_templates_touch_updated_at
  before update on public.feedback_templates
  for each row execute function public.touch_updated_at();

-- Seed: 5 cursuri (vezi COURSES din src/lib/diplomas.ts) x 4 module x 3 variante, text
-- placeholder generic - adminul le rescrie din pagina "Șabloane Feedback".
insert into public.feedback_templates (course_id, module_number, variant_index, message_text)
select course_id, module_number, variant_index,
  format(
    'Acesta este un mesaj de probă pentru %1$s, Modulul %2$s, Varianta %3$s. Editează acest text pentru a-i transmite felicitări lui [Numele Copilului] pentru munca depusă!',
    course_label, module_number, variant_index + 1
  )
from (values
  ('coblocks', 'Blocuri de cod'),
  ('python', 'Python'),
  ('roblox', 'Roblox'),
  ('alfabetizare', 'Alfabetizare'),
  ('unity', 'Unity')
) as c(course_id, course_label)
cross join (values (1), (2), (3), (4)) as m(module_number)
cross join (values (0), (1), (2)) as v(variant_index);

-- ----------------------------------------------------------------------------
--  random_diploma_parent_message: citeste acum din feedback_templates (course_id +
--  module_number) in loc de array-ul hardcodat de 10 variante generice. Semnatura se
--  schimba din (uuid, text) in (uuid, text, text, int) - adauga cursul si modulul, ambele
--  deja disponibile in finalize_diploma_with_reward la locul de apel. DROP explicit inainte,
--  ca Postgres identifica functiile dupa nume + tipurile parametrilor - schimbarea semnaturii
--  ar lasa altfel varianta veche orfana in baza de date.
-- ----------------------------------------------------------------------------
drop function if exists public.random_diploma_parent_message(uuid, text);

create or replace function public.random_diploma_parent_message(
  p_student_id uuid, p_first_name text, p_course_id text, p_module int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variants text[];
  v_count int;
  v_prev int;
  v_choice int;
begin
  select array_agg(message_text order by variant_index) into v_variants
    from public.feedback_templates
    where course_id = p_course_id and module_number = p_module;

  v_count := coalesce(array_length(v_variants, 1), 0);

  -- Fara sablon pentru acest curs/modul (ex: curs custom, in afara COURSES) - text generic
  -- de rezerva, ca generarea diplomei sa nu esueze niciodata din lipsa unui sablon.
  if v_count = 0 then
    return format(
      'Bună ziua! 👋 Felicitări, %1$s a finalizat cu succes un nou modul! 🎉 Găsiți atașată diploma de merit. Cu drag, echipa ByteCode.',
      p_first_name
    );
  end if;

  -- p_student_id poate fi null (elev "Manual", fara cont in tracker_students) - nu exista
  -- niciun rand de citit/actualizat pentru anti-repetare, alegerea ramane pur aleatoare.
  if p_student_id is not null then
    select last_diploma_message_variant into v_prev
      from public.tracker_students where id = p_student_id;
  end if;

  v_choice := 1 + floor(random() * v_count)::int;
  -- Daca a picat exact pe varianta trimisa data trecuta acestui copil, trece deterministic la
  -- urmatoarea (ciclic) - garanteaza ca NU se repeta niciodata consecutiv, fara bucla/risc de
  -- blocare, ramanand in continuare aleator la fiecare apel.
  if v_prev is not null and v_count > 1 and v_choice = v_prev then
    v_choice := 1 + (v_choice % v_count);
  end if;

  if p_student_id is not null then
    update public.tracker_students set last_diploma_message_variant = v_choice where id = p_student_id;
  end if;

  return replace(v_variants[v_choice], '[Numele Copilului]', p_first_name);
end;
$$;

-- finalize_diploma_with_reward apeleaza random_diploma_parent_message - trebuie redefinita
-- aici (aceeasi semnatura ca inainte, doar corpul se schimba la linia care apeleaza
-- random_diploma_parent_message) ca sa treaca mai departe cursul si modulul (v_course_id,
-- p_module - deja calculate in functie la acest punct, pentru ambele ramuri: elev real si
-- elev "Manual").
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

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali.
  if p_reward_received and p_reward_type = 'virtual_money' then
    insert into public.urgent_tasks
      (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, milestone_reached_at)
    values (
      'SEND_VIRTUAL_COINS', p_student_id, v_teacher_id, v_milestone,
      true, 'virtual_money', v_reward_details,
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
