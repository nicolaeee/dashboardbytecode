-- ============================================================================
--  DIPLOMA MANUALA (elev fara cont in tracker_students) NU MAI E VAZUTA DIRECT
--  DE PROFESOR - trece prin acelasi task pentru admin ca un elev real.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  Pana acum, mod "Manual" din Diplome.tsx (elev fara cont in DB, ex: copil care nu are inca
--  profil in aplicatie) deschidea sablonul diplomei DIRECT intr-un tab nou pentru profesor, dupa
--  raspunsul la intrebarile despre premiu - incalcand regula deja existenta pentru elevii reali
--  ("profesorul nu trebuie sa descarce nimic local" - vezi finalize_diploma_with_reward). Cerinta
--  explicita: profesorul (non-admin) nu trebuie sa vada NICIODATA diploma direct, indiferent de
--  mod - doar adminul, din Task-uri Urgente. Adminul insusi ramane neafectat (foloseste in
--  continuare accesul direct la mod Manual - vezi Diplome.tsx, isAdmin).
--
--  Solutia: urgent_tasks.student_id devine nullable - un elev Manual nu are niciun student_id de
--  legat, task-ul se bazeaza integral pe snapshot-ul diploma_* deja existent (diploma_student_name,
--  diploma_course_id etc. - acelasi mecanism care reconstruieste URL-ul diplomei fara sa aiba
--  nevoie de date live, vezi buildDiplomaUrl in lib/diplomas.ts). finalize_diploma_with_reward
--  primeste 4 parametri noi (p_manual_*), folositi STRICT cand p_student_id e null.
-- ============================================================================

alter table public.urgent_tasks alter column student_id drop not null;

-- p_student_id poate fi null (elev "Manual") - fara rand de citit/actualizat pentru
-- anti-repetarea mesajului, alegerea ramane pur aleatoare in acel caz.
create or replace function public.random_diploma_parent_message(p_student_id uuid, p_first_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages text[] := array[
    format('Bună ziua! 👋

Astăzi sărbătorim o reușită deosebită! %1$s a finalizat cu succes încă un modul din aventura programării. 🚀

Am urmărit cu mare bucurie creativitatea și dorința de a descoperi lucruri noi la fiecare lecție.

🎓 Găsiți atașată diploma de merit — vă invităm să o descărcați și să vă bucurați împreună de acest moment special. Vă mulțumim că ne sunteți alături!

Cu drag, echipa ByteCode.', p_first_name),
    format('Salutare! 🎉

Avem motive de mare bucurie astăzi. %1$s tocmai a absolvit o nouă etapă importantă la cursurile noastre!

A demonstrat foarte multă ambiție, concentrare și o minte ascuțită în rezolvarea provocărilor digitale. 💡

🏆 V-am atașat diploma care atestă această muncă minunată. Merită toate felicitările!

Cu drag, echipa ByteCode.', p_first_name),
    format('Vești minunate de la ByteCode! ✨

Suntem extrem de încântați să vă anunțăm că %1$s a trecut cu brio la nivelul următor!

Este o plăcere să îi urmărim evoluția și să vedem cum ideile prind viață pe ecran, pas cu pas. 💻

🏅 Vă transmitem atașat diploma de absolvire, o dovadă clară a efortului depus. Sărbătoriți cu zâmbete această reușită!

Cu drag, echipa ByteCode.', p_first_name),
    format('Bună ziua! 🌟

Evoluția la clasă ne umple mereu de energie pozitivă! %1$s a finalizat încă un modul cu rezultate excelente.

A dat dovadă de multă curiozitate și o pasiune reală pentru tehnologie pe tot parcursul orelor. 🚀

🎓 Diploma atașată acestui mesaj este mica noastră recunoaștere pentru o muncă uriașă. Vă mulțumim pentru încredere!

Cu drag, echipa ByteCode.', p_first_name),
    format('Salutare! 🎯

Călătoria în lumea programării continuă cu un nou succes! %1$s a finalizat cu brio modulul curent.

Ne bucură enorm să vedem capacitatea de a transforma fiecare lecție într-o experiență captivantă și plină de învățături. 💡

🏆 V-am atașat diploma de merit — vă invităm să o deschideți și să transmiteți felicitările noastre! Abia așteptăm următoarele proiecte.

Cu drag, echipa ByteCode.', p_first_name),
    format('Bună ziua! ✨

Când pasiunea întâlnește munca, apar rezultate magice! Suntem fericiți să vă anunțăm încheierea cu succes a unei noi etape de curs.

Nivelul de implicare pe care %1$s l-a arătat la fiecare proiect a fost o adevărată bucurie pentru noi. 💻

🎓 Găsiți diploma atașată mai jos, gata să fie descărcată și pusă în ramă. Vă dorim o zi minunată!

Cu drag, echipa ByteCode.', p_first_name),
    format('Vești excelente pentru familia dumneavoastră! 🎉

%1$s a reușit să finalizeze încă un modul plin de provocări tehnice și proiecte creative.

Ne-a impresionat profund modul în care a asimilat informațiile noi. 🚀

🏅 V-am atașat diploma care marchează această victorie educațională. Vă mulțumim că îi susțineți visurile digitale acasă!

Cu drag, echipa ByteCode.', p_first_name),
    format('Salutare! 💡

Suntem tare bucuroși să vă împărtășim o veste grozavă: %1$s a trecut cu bine de un nou modul!

Logica și răbdarea cu care a construit fiecare proiect ne-au inspirat la fiecare oră petrecută împreună. 🧩

🏆 Aveți atașată diploma de absolvire pentru a celebra acest moment special. Să ne auzim cu bine!

Cu drag, echipa ByteCode.', p_first_name),
    format('Bună ziua! 🌟

Efortul dă mereu roade, iar %1$s ne-a demonstrat asta din plin finalizând cu succes încă o etapă din programare!

Ne bucurăm enorm să fim ghizi în această aventură a cunoașterii. 💻

🎓 Diploma atașată este simbolul muncii fantastice din ultima perioadă. Vă felicităm și pe dumneavoastră pentru susținerea necondiționată!

Cu drag, echipa ByteCode.', p_first_name),
    format('Salutare! 🚀

Mai facem un pas uriaș în lumea tehnologiei! %1$s tocmai a absolvit o nouă etapă a cursurilor noastre.

Fiecare lecție a fost o dovadă clară de perseverență și imaginație fără limite. ✨

🏅 Vă lăsăm atașată diploma de merit, perfectă pentru a vă bucura de acest progres minunat. Vă mulțumim că sunteți alături de noi!

Cu drag, echipa ByteCode.', p_first_name)
  ];
  v_count int := array_length(v_messages, 1);
  v_prev int;
  v_choice int;
begin
  if p_student_id is not null then
    select last_diploma_message_variant into v_prev
      from public.tracker_students where id = p_student_id;
  end if;

  v_choice := 1 + floor(random() * v_count)::int;
  if v_prev is not null and v_choice = v_prev then
    v_choice := 1 + (v_choice % v_count);
  end if;

  if p_student_id is not null then
    update public.tracker_students set last_diploma_message_variant = v_choice where id = p_student_id;
  end if;

  return v_messages[v_choice];
end;
$$;

-- Semnatura se schimba (4 parametri noi p_manual_*, folositi STRICT cand p_student_id e null) -
-- DROP explicit inainte, altfel ar ramane orfana varianta veche cu 6 parametri (Postgres
-- identifica functiile dupa nume + tipurile parametrilor, "create or replace" NU inlocuieste o
-- functie cu semnatura diferita, doar adauga un overload nou).
drop function if exists public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text);

-- p_student_id NULL = elev "Manual" (fara cont in tracker_students) - foloseste STRICT
-- parametrii p_manual_*, nimic de citit/actualizat in tracker_students. Profesorul NU mai vede/
-- descarca diploma direct in acest caz (aceeasi regula ca la un elev real) - taskul pentru admin
-- se bazeaza integral pe snapshot-ul diploma_* (vezi buildDiplomaUrl, lib/diplomas.ts).
create or replace function public.finalize_diploma_with_reward(
  p_student_id uuid, p_module int, p_reward_received boolean,
  p_reward_type text default null, p_reward_details text default null,
  p_diploma_date text default null,
  p_manual_student_name text default null,
  p_manual_course_id text default null,
  p_manual_stars int default null,
  p_manual_total_stars int default null
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
    if nullif(trim(coalesce(p_manual_student_name, '')), '') is null then
      raise exception 'Numele elevului este obligatoriu.';
    end if;
    v_student_name := trim(p_manual_student_name);
    v_first_name := split_part(v_student_name, ' ', 1);
    v_course_id := p_manual_course_id;
    v_stars := greatest(0, least(16, coalesce(p_manual_stars, 0)));
    v_total_stars := greatest(0, coalesce(p_manual_total_stars, 0));
    v_teacher_id := auth.uid();
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_teacher_name
    from public.profiles p where p.id = v_teacher_id;

  insert into public.urgent_tasks
    (type, student_id, teacher_id, milestone, reward_received, reward_type, reward_details, parent_message,
     diploma_student_name, diploma_teacher_name, diploma_course_id, diploma_date, diploma_stars, diploma_total_stars,
     milestone_reached_at)
  values (
    'DIPLOMA_GENERATED', p_student_id, v_teacher_id, v_milestone,
    p_reward_received, v_reward_type, v_reward_details,
    public.random_diploma_parent_message(p_student_id, v_first_name),
    v_student_name, v_teacher_name, v_course_id, p_diploma_date,
    v_stars, v_total_stars,
    now()
  )
  on conflict (student_id, milestone, type) do nothing;

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

grant execute on function public.finalize_diploma_with_reward(uuid, int, boolean, text, text, text, text, text, int, int) to authenticated;
