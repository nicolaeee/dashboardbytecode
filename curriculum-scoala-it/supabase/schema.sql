-- ============================================================================
--  PLATFORMA DE CURRICULUM - SCOALA DE IT PENTRU COPII
--  Schema completa: tabele, functii de securitate, politici RLS, realtime.
--  Ruleaza acest fisier integral in Supabase -> SQL Editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILURI SI ROLURI
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'teacher');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'teacher',
  is_active   boolean not null default true,
  -- Nivelul profesorului in grila de promovare (vezi pagina /roadmap.html) - gestionat
  -- de admin din Panoul de Profesori, afisat profesorului pe pagina lui de Roadmap.
  level       text not null default 'Junior' check (level in ('Junior', 'Middle', 'Senior')),
  -- Telefonul profesorului - editabil din Panoul de Profesori, folosit si ca teacherPhone
  -- in payload-ul webhook-urilor de diploma (vezi progress/ProgressTracker.tsx).
  phone       text,
  -- Link catre calendarul propriu de recuperari al profesorului - editabil chiar de
  -- profesor din butonul "📅 Link Recuperari" de pe dashboard (progress/ProgressTracker.tsx).
  makeup_calendar_link text,
  created_at  timestamptz not null default now()
);

-- Profilul se creeaza automat la fiecare user nou din auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. IERARHIA CURRICULUMULUI (4 niveluri)
--    Platforma -> Curs -> Modul -> Lectie
-- ----------------------------------------------------------------------------
create table public.platforms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  accent      text not null default '#3A55E8',  -- culoarea de identitate a platformei
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete cascade,
  title       text not null,
  description text default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  description text default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.lessons (
  id                   uuid primary key default gen_random_uuid(),
  module_id            uuid not null references public.modules(id) on delete cascade,
  title                text not null,
  objective            text default '',   -- Obiectivul lectiei
  video_url            text default '',   -- YouTube / embed video explicativ
  example_video_url    text default '',   -- Video optional cu rezultatul final ("Lecție Exemplu")
  teacher_project_url  text default '',   -- Proiect profesor
  student_project_url  text default '',   -- Proiect copil
  notes                text default '',   -- Observatii importante
  homework             text default '',   -- Tema pentru acasa
  homework_url         text default '',   -- Link atasat temei
  position             int  not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on public.courses (platform_id);
create index on public.modules (course_id);
create index on public.lessons (module_id);

-- ----------------------------------------------------------------------------
-- 3. PERMISIUNI: pe MODUL (acces la tot modulul) sau pe LECTIE (acces punctual)
-- ----------------------------------------------------------------------------
create table public.module_permissions (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  module_id  uuid not null references public.modules(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (teacher_id, module_id)
);

create table public.lesson_permissions (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (teacher_id, lesson_id)
);

-- ----------------------------------------------------------------------------
-- 4. FUNCTII DE SECURITATE (folosite si de RLS, si de aplicatie prin RPC)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.has_module_access(p_module_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.module_permissions mp
                 where mp.module_id = p_module_id and mp.teacher_id = auth.uid());
$$;

-- Acces la lectie = permisiune pe modulul parinte SAU permisiune punctuala pe lectie
create or replace function public.has_lesson_access(p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.lesson_permissions lp
                 where lp.lesson_id = p_lesson_id and lp.teacher_id = auth.uid())
      or exists (select 1 from public.lessons l
                 join public.module_permissions mp on mp.module_id = l.module_id
                 where l.id = p_lesson_id and mp.teacher_id = auth.uid());
$$;

grant execute on function public.is_admin, public.has_module_access, public.has_lesson_access to authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.platforms          enable row level security;
alter table public.courses            enable row level security;
alter table public.modules            enable row level security;
alter table public.lessons            enable row level security;
alter table public.module_permissions enable row level security;
alter table public.lesson_permissions enable row level security;

-- PROFILE
create policy "profil propriu sau admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "adminul modifica profiluri" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "adminul sterge profiluri" on public.profiles
  for delete to authenticated using (public.is_admin());

-- SCHELETUL CURRICULUMULUI: vizibil tuturor (ca profesorul sa vada ce exista,
-- chiar daca e blocat), dar modificabil doar de admin.
create policy "schelet vizibil" on public.platforms for select to authenticated using (true);
create policy "admin scrie platforme" on public.platforms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "schelet vizibil" on public.courses for select to authenticated using (true);
create policy "admin scrie cursuri" on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "schelet vizibil" on public.modules for select to authenticated using (true);
create policy "admin scrie module" on public.modules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- CONTINUTUL LECTIILOR: doar admin sau profesor cu permisiune.
create policy "continut lectie doar cu permisiune" on public.lessons
  for select to authenticated using (public.has_lesson_access(id));
create policy "admin scrie lectii" on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- PERMISIUNI: profesorul isi vede propriile permisiuni, adminul le administreaza.
create policy "vad propriile permisiuni" on public.module_permissions
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "admin gestioneaza permisiuni modul" on public.module_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "vad propriile permisiuni" on public.lesson_permissions
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
create policy "admin gestioneaza permisiuni lectie" on public.lesson_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. VIEW: titlurile lectiilor blocate (doar metadate, fara continut)
--    Profesorul vede ca lectia exista si ca e blocata, dar nu si continutul ei.
--    Viewul ruleaza cu drepturile owner-ului, deci ocoleste RLS pe coloanele
--    expuse explicit aici (id, modul, titlu, pozitie) - nimic sensibil.
-- ----------------------------------------------------------------------------
create or replace view public.lesson_index
with (security_invoker = off) as
  select id, module_id, title, position from public.lessons;

revoke all on public.lesson_index from anon;
grant select on public.lesson_index to authenticated;

-- ----------------------------------------------------------------------------
-- 7. updated_at automat pentru lectii
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 8. REALTIME: schimbarile adminului ajung instant la profesori
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.platforms;
alter publication supabase_realtime add table public.courses;
alter publication supabase_realtime add table public.modules;
alter publication supabase_realtime add table public.lessons;
alter publication supabase_realtime add table public.module_permissions;
alter publication supabase_realtime add table public.lesson_permissions;

-- ----------------------------------------------------------------------------
-- 9. PROGRESS TRACKER: grupe, elevi si progresul lor (stelute) - izolate per cont
-- ----------------------------------------------------------------------------
create table public.tracker_groups (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  group_name   text not null,
  module_count int  not null default 1,
  reward_type  text not null default 'stars',
  day_of_week  text,   -- 'luni' .. 'duminica', null = nespecificat
  time_of_day  text,   -- 'HH:MM', optional
  diploma_milestone int not null default 0,  -- cel mai mare multiplu de 16 lectii deja notificat/trimis
  -- Cursul grupei (leaga grupa de folderul de sabloane de diploma) - text liber, nu enum:
  -- admin/profesorul poate alege dintr-o lista cunoscuta SAU introduce un curs custom din
  -- "+ Alt curs..." (vezi CourseGrid, progress/ProgressTracker.tsx). Fara constrangere CHECK
  -- (vezi supabase/migrations/loosen_tracker_group_course_constraint.sql).
  course       text,
  meet_link    text,   -- link-ul Google Meet al clasei, editabil din antetul clasei in Tracker
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.tracker_students (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid not null references public.tracker_groups(id) on delete cascade,
  name          text not null,
  progress      int  not null default 0,
  -- Decalaj manual de lectii (vezi src/lib/lessonNumbering.ts) - punct de pornire pentru
  -- elevii cu istoric dinainte de Tracker, folosit la calculul "M{x} / L{y}".
  lesson_offset int  not null default 0,
  -- Suprascriere manuala a totalului de prezente/absente (acelasi tipar ca `progress`
  -- pentru stelute) - editabila din formularul "Editeaza Elev".
  presence_count int not null default 0,
  absence_count  int not null default 0,
  -- Task-uri urgente de diploma: pragul (multiplu de 16 prezente) care asteapta diploma
  -- trimisa, respectiv ultimul prag deja marcat ca trimis - vezi "Task-uri Urgente" din
  -- dashboard-ul profesorului.
  pending_diploma_milestone      int,
  last_diploma_issued_milestone  int not null default 0,
  -- Numar de recuperari neefectuate: +1 la marcarea "Absent" la o lectie, -1 (fara sa scada
  -- sub 0) cand absenta e anulata sau recuperarea e rezolvata din "Task-uri Urgente".
  pending_makeups int not null default 0,
  -- Countdown de 7 zile + cooldown de 48h intre notificari (max 3) pentru cardul "🚨 Recuperare
  -- necesara" din Task-uri Urgente: ziua absentei care a declansat alerta curenta, cate
  -- notificari s-au trimis deja si cand s-a trimis ultima.
  absence_date date,
  makeup_notification_count int not null default 0,
  last_makeup_notification timestamptz,
  -- Stare intermediara intre "recuperare neefectuata" si "recuperare efectuata": profesorul
  -- a stabilit deja o data cu parintele (buton "📅 Programat" din Task-uri Urgente) - ascunde
  -- "Trimite Notificare"/"Nu mai e nevoie" din card, ca sa nu se mai trimita alte reminder-uri
  -- catre parinte dupa ce recuperarea e deja stabilita. Resetat la false odata cu restul
  -- campurilor de recuperare cand alerta se inchide complet (vezi handleMakeupResolved).
  is_scheduled boolean not null default false,
  -- Numele mic, folosit in notificarile catre parinti (spre deosebire de `name`,
  -- numele complet folosit in registru/tracker).
  short_name    text,
  -- Pana la 5 telefoane/email-uri de parinte (format Green API pt telefoane, ex:
  -- "40712345678@c.us" - sufixul se adauga automat la trimiterea notificarii).
  -- GDPR: coloane excluse explicit din fetch-ul folosit de profesori (vezi
  -- progress/page.tsx); doar adminul le citeste/scrie, din Fisa Elevului.
  parent_phones text[] not null default '{}',
  parent_emails text[] not null default '{}',
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- O lectie/sedinta tinuta pentru o grupa (numerotata secvential in cadrul grupei).
-- `format` e dedus AUTOMAT la creare din numarul de elevi din grupa (1 = individual,
-- >1 = grup) - baza pentru raportul Payslip din /registru, fara alegere manuala.
create table public.tracker_lessons (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.profiles(id) on delete cascade,
  group_id       uuid not null references public.tracker_groups(id) on delete cascade,
  session_number int  not null,
  -- Pozitia REALA in materie (M{x}/L{y}) - separata de session_number (contorul cronologic
  -- al sedintelor fizice, care nu se inghata niciodata). Ramane identica cu a lectiei anterioare
  -- daca aceea a fost 100% absenta - vezi createLesson in ProgressTracker.tsx.
  curriculum_index int not null,
  lesson_date    date not null default current_date,
  lesson_time    text,   -- 'HH:MM', optional
  format         text not null default 'grup' check (format in ('grup', 'individual')),
  -- false = "Neefectuata" (absolut toti elevii activi ai grupei marcati Absent la aceasta
  -- lectie) - recalculat automat la fiecare marcare de prezenta (vezi setAttendanceStatus in
  -- ProgressTracker.tsx). Controleaza DOAR avansarea materiei (M/L) - devine true si pe baza
  -- unui 'made_up' fara nicio sedinta live. Payslip-ul din /registru NU foloseste acest flag
  -- (ar dubla ora), ci prezenta 'present' live - vezi src/lib/registryCalc.ts.
  is_taught      boolean not null default true,
  homework_note  text,   -- notita libera de tema pentru aceasta lectie, editabila din Tracker
  created_at     timestamptz not null default now(),
  unique (group_id, session_number)
);

-- Prezenta + steluta per elev, per lectie. Complet separate:
-- prezenta (status) se inregistreaza mereu; steluta (star_count, 0-3) se acorda strict daca
-- elevul si-a facut tema - profesorul o poate adauga/corecta oricand retroactiv pe o lectie
-- anterioara (multiplicator, nu doar bifa facuta/nefacuta).
-- recovery_date/recovery_time = data/ora reala a sedintei 1-la-1 de recuperare (diferita de
-- data lectiei ratate initial) - alimenteaza automat coloana "Recuperari" din Payslip.
create table public.tracker_attendance (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.profiles(id) on delete cascade,
  lesson_id      uuid not null references public.tracker_lessons(id) on delete cascade,
  student_id     uuid not null references public.tracker_students(id) on delete cascade,
  status         text not null default 'absent' check (status in ('present', 'absent', 'made_up')),
  star_count     int  not null default 0,
  recovery_date  date,
  recovery_time  text,   -- 'HH:MM', optional
  -- Recuperare de grup: null = recuperare individuala (1-la-1), fiecare rand conteaza separat
  -- in Payslip. Cand e setat (acelasi uuid pe toate randurile participantilor, generat
  -- client-side la confirmarea popup-ului "Este o recuperare de grup?" din ProgressTracker.tsx),
  -- TOATE randurile cu acelasi id conteaza impreuna ca O SINGURA ora predata/platita in
  -- /registru (vezi Registru.tsx), desi fiecare elev isi recupereaza propria lectie ratata.
  recovery_group_id uuid,
  updated_at     timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create index on public.tracker_groups (teacher_id);
create index on public.tracker_students (teacher_id);
create index on public.tracker_students (group_id);
create index on public.tracker_lessons (group_id);
create index on public.tracker_lessons (teacher_id);
create index on public.tracker_attendance (lesson_id);
create index on public.tracker_attendance (student_id);
create index on public.tracker_attendance (teacher_id);
create index on public.tracker_attendance (recovery_group_id);
-- Cel mai frecvent filtru din aplicatie: randurile ACTIVE ale profesorului curent
-- (teacher_id = ... and deleted_at is null) - vezi progress/page.tsx, diploma-groups etc.
create index on public.tracker_groups (teacher_id, deleted_at);
create index on public.tracker_students (teacher_id, deleted_at);

create trigger tracker_attendance_touch before update on public.tracker_attendance
  for each row execute function public.touch_updated_at();

alter table public.tracker_groups     enable row level security;
alter table public.tracker_students   enable row level security;
alter table public.tracker_lessons    enable row level security;
alter table public.tracker_attendance enable row level security;

-- Izolare stricta: fiecare profesor vede si scrie doar propriile grupe/elevi/lectii/prezenta.
-- WITH CHECK verifica in plus, la insert/update, ca orice referinta parinte (group_id /
-- lesson_id / student_id) apartine tot profesorului care scrie randul - altfel un profesor
-- ar putea "agata" un rand de-al lui de o grupa/lectie/elev straina printr-un request direct
-- catre REST-ul Supabase (ex. din consola), ocolind UI-ul aplicatiei.
-- Crearea claselor e rezervata exclusiv adminului (vezi createClass, admin/actions.ts) -
-- profesorul isi vede/edita/sterge propriile grupe, dar NU are politica de INSERT (doar
-- politica adminului, mai jos, acopera crearea). Trei politici separate, nu una "for all",
-- exact ca sa excludem INSERT din ce poate face profesorul.
create policy "profesorul vede propriile grupe" on public.tracker_groups
  for select to authenticated using (teacher_id = auth.uid());

create policy "profesorul edita propriile grupe" on public.tracker_groups
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul sterge propriile grupe" on public.tracker_groups
  for delete to authenticated using (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza elevii" on public.tracker_students
  for all to authenticated using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.tracker_groups g where g.id = tracker_students.group_id and g.teacher_id = auth.uid())
  );

create policy "profesorul isi gestioneaza lectiile" on public.tracker_lessons
  for all to authenticated using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.tracker_groups g where g.id = tracker_lessons.group_id and g.teacher_id = auth.uid())
  );

create policy "profesorul isi gestioneaza prezenta" on public.tracker_attendance
  for all to authenticated using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.tracker_lessons l where l.id = tracker_attendance.lesson_id and l.teacher_id = auth.uid())
    and exists (select 1 from public.tracker_students s where s.id = tracker_attendance.student_id and s.teacher_id = auth.uid())
  );

-- Adminul are acces complet peste toate grupele/elevii/lectiile/prezenta tuturor profesorilor
-- (necesar pentru panoul de admin si alerta de diploma la nivel global).
create policy "adminul gestioneaza toate grupele" on public.tracker_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toti elevii" on public.tracker_students
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toate lectiile" on public.tracker_lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toata prezenta" on public.tracker_attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.tracker_groups;
alter publication supabase_realtime add table public.tracker_students;
alter publication supabase_realtime add table public.tracker_lessons;
alter publication supabase_realtime add table public.tracker_attendance;

-- Transfer clasa intre profesori (Panoul Admin -> Editeaza Clasa) + istoricul "cine a predat"
-- (taught_by), care NU se muta la transfer - vezi supabase/migrations/add_transfer_class_teacher.sql
-- si supabase/migrations/add_lesson_taught_by_history.sql pentru explicatia completa.
alter table public.tracker_lessons
  add column if not exists taught_by uuid references public.profiles(id) on delete set null;
alter table public.tracker_attendance
  add column if not exists taught_by uuid references public.profiles(id) on delete set null;

-- Backfill: pentru clasele care nu au fost niciodata transferate, proprietarul curent e
-- chiar cel care a predat. Clasele deja transferate (ex. Andrei: David -> Bogdan) se
-- corecteaza separat cu supabase/repair/repair_transferred_class_history.sql.
-- Trigger-ul de updated_at e oprit pe durata backfill-ului: updated_at alimenteaza arhivarea
-- claselor inactive (archive_inactive_tracker_groups), iar backfill-ul nu e activitate reala.
update public.tracker_lessons set taught_by = teacher_id where taught_by is null;
alter table public.tracker_attendance disable trigger tracker_attendance_touch;
update public.tracker_attendance set taught_by = teacher_id where taught_by is null;
alter table public.tracker_attendance enable trigger tracker_attendance_touch;

create index if not exists tracker_lessons_taught_by_idx on public.tracker_lessons (taught_by);
create index if not exists tracker_attendance_taught_by_idx on public.tracker_attendance (taught_by, status);

-- Cine poate seta taught_by explicit: adminul sau o sesiune fara utilizator (SQL Editor /
-- service role). Un profesor NU il poate modifica printr-un request direct catre REST
-- (altfel si-ar putea atribui orele altcuiva in Payslip).
create or replace function public.can_override_taught_by()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin();
$$;

-- Lectie: la creare, taught_by = proprietarul de atunci (profesorul care o tine).
-- La update, taught_by e inghetat (doar adminul/SQL il poate corecta).
create or replace function public.tracker_lessons_set_taught_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.taught_by is null or not public.can_override_taught_by() then
      new.taught_by := new.teacher_id;
    end if;
  elsif new.taught_by is distinct from old.taught_by and not public.can_override_taught_by() then
    new.taught_by := old.taught_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tracker_lessons_taught_by on public.tracker_lessons;
create trigger tracker_lessons_taught_by before insert or update on public.tracker_lessons
  for each row execute function public.tracker_lessons_set_taught_by();

-- Prezenta: 'present'/'absent' apartin sedintei live -> taught_by = cine a predat lectia.
-- 'made_up' e o sedinta separata (recuperarea) -> taught_by = proprietarul clasei in momentul
-- marcarii (profesorul care a tinut recuperarea). Recalculat DOAR cand se schimba statusul -
-- o schimbare de teacher_id (transfer) sau de steluțe nu atinge istoricul.
create or replace function public.tracker_attendance_set_taught_by()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_explicit boolean;
begin
  v_explicit := public.can_override_taught_by() and new.taught_by is not null
    and (tg_op = 'INSERT' or new.taught_by is distinct from old.taught_by);

  if v_explicit then
    return new;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'made_up' then
      new.taught_by := new.teacher_id;
    else
      select coalesce(l.taught_by, l.teacher_id) into new.taught_by
        from public.tracker_lessons l where l.id = new.lesson_id;
    end if;
  else
    new.taught_by := old.taught_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tracker_attendance_taught_by on public.tracker_attendance;
create trigger tracker_attendance_taught_by before insert or update on public.tracker_attendance
  for each row execute function public.tracker_attendance_set_taught_by();

-- Transferul clasei: teacher_id (proprietarul) se muta in continuare pe toate cele 4 tabele -
-- noul profesor vede si continua clasa cu tot istoricul (contor, steluțe, prezente intacte).
-- taught_by NU se atinge pentru lectiile deja tinute; doar lectiile viitoare / inca netinute
-- (fara nicio prezenta 'present'/'made_up') trec la noul profesor, care le va preda.
create or replace function public.transfer_class_teacher(p_group_id uuid, p_new_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_teacher_id uuid;
begin
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

  -- Lectiile programate in viitor, inca netinute, vor fi predate de noul profesor.
  update public.tracker_lessons l set teacher_id = p_new_teacher_id, taught_by = p_new_teacher_id
    where l.group_id = p_group_id
      and l.lesson_date >= current_date
      and not exists (
        select 1 from public.tracker_attendance a
        where a.lesson_id = l.id and a.status in ('present', 'made_up')
      );
  -- Restul (istoricul): doar proprietarul se muta, taught_by ramane neatins.
  update public.tracker_lessons set teacher_id = p_new_teacher_id
    where group_id = p_group_id and teacher_id <> p_new_teacher_id;

  -- Prezenta: doar proprietarul. Trigger-ul pastreaza taught_by (statusul nu se schimba).
  update public.tracker_attendance set teacher_id = p_new_teacher_id
    where lesson_id in (select id from public.tracker_lessons where group_id = p_group_id);
end;
$$;

grant execute on function public.transfer_class_teacher(uuid, uuid) to authenticated;

-- Datele pentru /registru (Payslip) ale unui profesor, dupa cine a PREDAT efectiv - nu dupa
-- proprietarul curent al clasei. security definer pentru ca, dupa un transfer, vechiul
-- profesor nu mai are acces RLS la clasa/elevii/lectiile pe care le-a predat; functia ii
-- intoarce strict ce ii trebuie registrului (nume elev/grupa, fara date de contact).
create or replace function public.get_teacher_registry(p_teacher_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if p_teacher_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Nu ai acces la registrul acestui profesor.';
  end if;

  with att as (
    select a.* from public.tracker_attendance a
    where a.taught_by = p_teacher_id and a.status in ('present', 'made_up')
  ),
  les as (
    -- Lectiile predate + lectiile originale ale recuperarilor tinute de profesor (doar pentru
    -- numele grupei; nu sunt platite ca lectii live - n-au prezenta 'present' a lui).
    select l.* from public.tracker_lessons l
    where l.taught_by = p_teacher_id
       or l.id in (select lesson_id from att where status = 'made_up')
  )
  select json_build_object(
    'lessons', coalesce((select json_agg(les) from les), '[]'::json),
    'attendance', coalesce((select json_agg(att) from att), '[]'::json),
    'students', coalesce((
      select json_agg(json_build_object('id', s.id, 'name', s.name))
      from public.tracker_students s where s.id in (select student_id from att)
    ), '[]'::json),
    'groups', coalesce((
      select json_agg(json_build_object('id', g.id, 'group_name', g.group_name))
      from public.tracker_groups g where g.id in (select group_id from les)
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_teacher_registry(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. ARHIVARE AUTOMATA CLASE INACTIVE (6 luni fara nicio lectie/prezenta noua)
--    Necesita extensia "pg_cron" (Supabase -> Database -> Extensions, daca
--    CREATE EXTENSION de mai jos esueaza cu o eroare de permisiuni).
--    Arhivarea = soft delete (deleted_at), exact ca butonul manual "Sterge
--    Clasa" -> lectiile/prezentele NU sunt sterse, raman vizibile in /registru.
--    Clasa arhivata apare in Urna si poate fi restaurata manual.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function public.archive_inactive_tracker_groups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_ids uuid[];
begin
  with last_activity as (
    select
      g.id,
      greatest(
        g.created_at,
        coalesce(max(l.created_at), g.created_at),
        coalesce(max(a.updated_at), g.created_at)
      ) as activity_at
    from public.tracker_groups g
    left join public.tracker_lessons l on l.group_id = g.id
    left join public.tracker_attendance a on a.lesson_id = l.id
    where g.deleted_at is null
    group by g.id, g.created_at
  ),
  archived as (
    update public.tracker_groups g
    set deleted_at = now()
    from last_activity la
    where g.id = la.id
      and la.activity_at < now() - interval '6 months'
    returning g.id
  )
  select array_agg(id) into archived_ids from archived;

  if archived_ids is not null then
    update public.tracker_students s
    set deleted_at = now()
    where s.group_id = any(archived_ids) and s.deleted_at is null;
  end if;
end;
$$;

grant execute on function public.archive_inactive_tracker_groups() to postgres, service_role;

select cron.schedule(
  'archive-inactive-tracker-groups-daily',
  '0 3 * * *',
  $$select public.archive_inactive_tracker_groups();$$
);

-- ----------------------------------------------------------------------------
-- 11. PRIMUL ADMINISTRATOR
--    Creeaza-ti contul din Supabase -> Authentication -> Add user,
--    apoi ruleaza linia de mai jos cu emailul tau:
-- ----------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'adresa@scoala.ro';

-- ----------------------------------------------------------------------------
-- 12. STATUS ELEV, TRANSFER, ABONAMENTE, ACCES LA MODULE NOI (Super Admin)
--    Vezi supabase/migrations/add_student_status_and_transfers.sql,
--    add_lesson_balance_subscriptions.sql si add_feature_access_and_dropout_stats.sql
--    pentru comentariile complete de business din spatele fiecarei decizii.
-- ----------------------------------------------------------------------------
alter table public.tracker_students
  add column status text not null default 'active'
    check (status in ('active', 'paused', 'dropped_out')),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id) on delete set null,
  add column status_note text,
  add column subscription_type text
    check (subscription_type in (
      'individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral',
      'lunar_4', 'integral_16', 'integral_32', 'integral_48', 'custom'
    )),
  add column total_lessons_remaining int not null default 0;

create index on public.tracker_students (teacher_id, status);

create table public.tracker_student_transfers (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.tracker_students(id) on delete cascade,
  from_teacher_id uuid references public.profiles(id) on delete set null,
  to_teacher_id   uuid not null references public.profiles(id) on delete cascade,
  from_group_id   uuid references public.tracker_groups(id) on delete set null,
  to_group_id     uuid not null references public.tracker_groups(id) on delete cascade,
  transferred_by  uuid references public.profiles(id) on delete set null,
  transferred_at  timestamptz not null default now(),
  note            text
);
create index on public.tracker_student_transfers (student_id);
create index on public.tracker_student_transfers (to_teacher_id);
alter table public.tracker_student_transfers enable row level security;
create policy "adminul vede si gestioneaza transferurile" on public.tracker_student_transfers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.transfer_student_teacher(
  p_student_id uuid, p_new_teacher_id uuid, p_new_group_id uuid, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old_teacher_id uuid;
  v_old_group_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Doar administratorii pot transfera un elev.';
  end if;
  select teacher_id, group_id into v_old_teacher_id, v_old_group_id
    from public.tracker_students where id = p_student_id;
  if v_old_teacher_id is null then
    raise exception 'Elevul nu a fost găsit.';
  end if;
  if not exists (
    select 1 from public.tracker_groups where id = p_new_group_id and teacher_id = p_new_teacher_id and deleted_at is null
  ) then
    raise exception 'Clasa aleasă nu aparține profesorului ales.';
  end if;
  if v_old_teacher_id = p_new_teacher_id and v_old_group_id = p_new_group_id then
    return;
  end if;
  update public.tracker_students
    set teacher_id = p_new_teacher_id, group_id = p_new_group_id
    where id = p_student_id;
  insert into public.tracker_student_transfers
    (student_id, from_teacher_id, to_teacher_id, from_group_id, to_group_id, transferred_by, note)
  values (p_student_id, v_old_teacher_id, p_new_teacher_id, v_old_group_id, p_new_group_id, auth.uid(), p_note);
end;
$$;
grant execute on function public.transfer_student_teacher(uuid, uuid, uuid, text) to authenticated;

create table public.tracker_lesson_transactions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.tracker_students(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  delta         int not null,
  reason        text not null check (reason in ('purchase', 'adjustment')),
  balance_after int not null,
  -- Pachetul cu numar fix ales la aceasta tranzactie (ex: 'integral_16') - baza pentru
  -- numaratoarea "Abonamentul #N" din Fisa Elevului (vezi supabase/migrations/
  -- add_tracker_lesson_transaction_package_tier.sql pentru comentariul complet).
  package_tier  text
    check (package_tier in (
      'individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral',
      'lunar_4', 'integral_16', 'integral_32', 'integral_48'
    )),
  -- Mod de Studiu la aceasta tranzactie - necesar ca sa poata fi reconstituit exact abonamentul
  -- anterior la stergerea unei tranzactii gresite (vezi supabase/migrations/
  -- add_tracker_lesson_transaction_study_mode.sql).
  study_mode    text check (study_mode in ('individual', 'grup')),
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.tracker_lesson_transactions (student_id);
create index on public.tracker_lesson_transactions (teacher_id);
create index on public.tracker_lesson_transactions (student_id, package_tier);
alter table public.tracker_lesson_transactions enable row level security;
create policy "profesorul isi gestioneaza tranzactiile de lectii" on public.tracker_lesson_transactions
  for all to authenticated using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.tracker_students s where s.id = tracker_lesson_transactions.student_id and s.teacher_id = auth.uid())
  );
create policy "adminul gestioneaza toate tranzactiile de lectii" on public.tracker_lesson_transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.feature_access (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('subscriptions', 'dropout_analytics')),
  enabled    boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, module_key)
);
alter table public.feature_access enable row level security;
create policy "vad propriul acces la module" on public.feature_access
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "adminul gestioneaza accesul la module" on public.feature_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.has_feature_access(p_module_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.feature_access fa
                 where fa.module_key = p_module_key and fa.user_id = auth.uid() and fa.enabled = true);
$$;
grant execute on function public.has_feature_access(text) to authenticated;

create or replace function public.teacher_dropout_stats(p_months int default 4)
returns table (
  teacher_id uuid, teacher_name text, total_students bigint, dropped_students bigint, dropout_rate numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := now() - (p_months || ' months')::interval;
  v_end   timestamptz := now();
begin
  return query
    select
      p.id,
      coalesce(nullif(p.full_name, ''), p.email),
      count(s.id) filter (
        where s.created_at <= v_end and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
      ),
      count(s.id) filter (where s.status = 'dropped_out' and s.status_changed_at between v_start and v_end),
      case when count(s.id) filter (
        where s.created_at <= v_end and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
      ) = 0 then 0
      else round(
        count(s.id) filter (where s.status = 'dropped_out' and s.status_changed_at between v_start and v_end)::numeric
        / count(s.id) filter (
            where s.created_at <= v_end and (s.status <> 'dropped_out' or s.status_changed_at >= v_start)
          ) * 100, 1)
      end
    from public.profiles p
    left join public.tracker_students s on s.teacher_id = p.id
    where p.role = 'teacher' and (public.is_admin() or p.id = auth.uid())
    group by p.id, p.full_name, p.email
    order by p.full_name;
end;
$$;
grant execute on function public.teacher_dropout_stats(int) to authenticated;

-- ----------------------------------------------------------------------------
-- 13. ALERTA DIPLOMA INTARZIATA (>= 3 zile LUCRATOARE de la deschiderea task-ului)
--    Vezi supabase/migrations/add_diploma_overdue_alerts.sql pentru comentariile
--    complete de business din spatele fiecarei decizii. Necesita pg_net (Supabase
--    -> Database -> Extensions, daca CREATE EXTENSION esueaza cu eroare de permisiuni).
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.tracker_students
  add column pending_diploma_milestone_at timestamptz,
  add column diploma_overdue_alert_sent_at timestamptz;

create or replace function public.touch_pending_diploma_milestone()
returns trigger language plpgsql as $$
begin
  if new.pending_diploma_milestone is distinct from old.pending_diploma_milestone then
    new.pending_diploma_milestone_at := case when new.pending_diploma_milestone is null then null else now() end;
    new.diploma_overdue_alert_sent_at := null;
  end if;
  return new;
end;
$$;

create trigger tracker_students_touch_pending_diploma
  before update on public.tracker_students
  for each row execute function public.touch_pending_diploma_milestone();

-- Adauga N zile LUCRATOARE (luni-vineri) la o data - vezi send_overdue_diploma_alerts mai jos.
create or replace function public.add_business_days(start_date date, num_days int)
returns date language plpgsql immutable as $$
declare
  result date := start_date;
  added int := 0;
begin
  while added < num_days loop
    result := result + 1;
    if extract(isodow from result) < 6 then -- isodow: 1=Luni .. 5=Vineri, 6=Sambata, 7=Duminica
      added := added + 1;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.send_overdue_diploma_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select s.id, s.name as student_name, s.pending_diploma_milestone_at,
           coalesce(nullif(p.full_name, ''), p.email) as teacher_name
    from public.tracker_students s
    join public.profiles p on p.id = s.teacher_id
    where s.deleted_at is null
      and s.pending_diploma_milestone is not null
      and current_date >= public.add_business_days(s.pending_diploma_milestone_at::date, 3)
      and s.diploma_overdue_alert_sent_at is null
  loop
    perform net.http_post(
      url := 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY4MDYzNjA0M2Q1MjZjNTUzMjUxMzMi_pc',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'nume_copil', r.student_name,
        'nume_profesor', r.teacher_name,
        'data_cererii', r.pending_diploma_milestone_at,
        'mesaj_alerta', 'Profesorul nu a trimis diploma de 3 zile lucrătoare. Te rugăm să ceri diploma.'
      )
    );
    update public.tracker_students set diploma_overdue_alert_sent_at = now() where id = r.id;
  end loop;
end;
$$;

grant execute on function public.send_overdue_diploma_alerts() to postgres, service_role;

select cron.schedule(
  'send-overdue-diploma-alerts-daily',
  '0 7 * * *',
  $$select public.send_overdue_diploma_alerts();$$
);

-- ----------------------------------------------------------------------------
-- 13. ISTORIC PACHET LECTII (elevi cu lectii efectuate inainte de platforma)
--    Vezi supabase/migrations/add_tracker_package_history.sql pentru comentariul
--    complet de business din spatele acestor doua coloane.
-- ----------------------------------------------------------------------------
alter table public.tracker_students
  add column total_package_lessons int not null default 0,
  add column already_completed_lessons int not null default 0;

-- ----------------------------------------------------------------------------
-- 14. MOD DE STUDIU (dropdown dependent pentru pachetele cu numar fix de lectii)
--    Vezi supabase/migrations/add_tracker_study_mode_package_tiers.sql pentru
--    comentariul complet de business.
-- ----------------------------------------------------------------------------
alter table public.tracker_students
  add column study_mode text check (study_mode in ('individual', 'grup'));

-- ----------------------------------------------------------------------------
-- 15. TASK-URI URGENTE (ADMIN)
--    Vezi supabase/migrations/add_urgent_tasks.sql pentru comentariul complet de business.
-- ----------------------------------------------------------------------------
create table public.urgent_tasks (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS', 'SUBSCRIPTION_FINISHED')),
  status               text not null default 'NEW' check (status in ('NEW', 'IN_PROGRESS', 'COMPLETED')),
  -- Nullable: un elev "Manual" (fara cont in tracker_students, generat din Diplome.tsx -> mod
  -- "Manual") nu are niciun student_id de legat - task-ul se bazeaza atunci integral pe
  -- snapshot-ul diploma_* de mai jos (vezi finalize_diploma_with_reward, buildDiplomaUrl).
  student_id           uuid references public.tracker_students(id) on delete cascade,
  teacher_id           uuid references public.profiles(id) on delete set null,
  milestone            int not null,
  reward_received      boolean not null default false,
  reward_type          text check (reward_type is null or reward_type in ('virtual_money', 'super_power')),
  reward_details       text,
  parent_message       text,
  diploma_student_name text,
  diploma_teacher_name text,
  diploma_course_id    text,
  diploma_date         text,
  diploma_stars        int,
  diploma_total_stars  int,
  milestone_reached_at timestamptz not null,
  completed_at         timestamptz,
  completed_by         uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (student_id, milestone, type)
);

create index on public.urgent_tasks (status);
create index on public.urgent_tasks (student_id);
create index on public.urgent_tasks (teacher_id);

alter table public.urgent_tasks enable row level security;

create policy "adminul gestioneaza task-urile urgente" on public.urgent_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Indexul (1-based) variantei de mesaj trimisa la ULTIMA diploma a elevului - vezi
-- random_diploma_parent_message mai jos (add_feedback_templates.sql).
alter table public.tracker_students
  add column last_diploma_message_variant smallint;

-- ----------------------------------------------------------------------------
-- 15b. ȘABLOANE FEEDBACK DIPLOMĂ (CMS Admin) - vezi supabase/migrations/add_feedback_templates.sql
--    pentru comentariul complet de business. CATE 3 variante de mesaj catre parinte per
--    curs + modul (5 cursuri x 4 module x 3 variante), editabile din Admin -> "Șabloane
--    Feedback" (STRICT admin - RLS mai jos - profesorii nu le vad/citesc direct). Placeholder-ul
--    [Numele Copilului] e inlocuit automat cu prenumele elevului la generarea diplomei - vezi
--    random_diploma_parent_message mai jos, care ruleaza security definer ca profesorul sa
--    primeasca textul final fara sa aiba el insusi acces la tabela.
-- ----------------------------------------------------------------------------
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

-- random_diploma_parent_message citeste acum cele 3 variante din feedback_templates
-- (course_id + module_number) in loc de array-ul hardcodat de 10 variante generice de mai
-- inainte. Alege aleator, dar EVITA sa repete exact aceeasi varianta trimisa data trecuta
-- ACELUIASI elev (last_diploma_message_variant, actualizat de aceasta functie la fiecare
-- apel) - un copil care avanseaza de la un modul la altul nu mai primeste de doua ori la
-- rand acelasi text. Fara niciun sablon pentru cursul/modulul dat (ex: curs custom, in afara
-- COURSES) - text generic de rezerva, ca generarea diplomei sa nu esueze niciodata.
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
    -- Steluțele de pe diploma = STRICT temele din lectiile modulului diplomei (fiecare modul
    -- porneste de la 0), la fel ca contorul X/16 de pe Cardul Elevului din Progress Tracker
    -- (vezi moduleStarsFor in src/lib/lessonNumbering.ts). v_milestone / 16 = modulul real
    -- (ex. 80 -> 5, chiar daca sablonul folosit e cel al Modulului 4).
    select least(16, coalesce(sum(a.star_count), 0))::int into v_stars
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

-- ----------------------------------------------------------------------------
-- 15c. ALERTA "💳 Abonament finalizat" (Task-uri Urgente, admin) - declansata automat, la nivel
--    de baza de date, cand soldul de lectii al unui elev (total_lessons_remaining) ajunge la
--    EXACT 0. Complet independenta de webhook-ul Pabbly existent (/api/lesson-balance-alerts,
--    apelat client-side la 2 sau 0 ramase) - acela ramane neschimbat.
--
--    pending_subscription_alert (coloana noua pe tracker_students) e flag-ul de dedublicare:
--    true = exista deja un task deschis pentru acest elev, nu se mai creeaza altul cat timp
--    soldul ramane la 0. Resetat automat la false in clipa in care soldul redevine pozitiv
--    (reinnoire abonament - orice crestere, indiferent din ce ecran vine: "Editeaza Elev",
--    "+ Adauga abonament", panoul Abonamente etc.), ca urmatorul ciclu de epuizare sa poata
--    declansa din nou alerta.
--
--    milestone ramane mereu 0 pentru acest tip (conceptul de "prag" din diplome nu se aplica
--    aici) - constrangerea unique(student_id, milestone, type) ar bloca altfel silentios a doua
--    alerta pentru acelasi elev, la un ciclu ulterior de epuizare; ON CONFLICT DO UPDATE
--    "redeschide" acelasi rand (status -> NEW, timestamp-uri proaspete) in loc sa esueze sau sa
--    fie ignorat.
-- ----------------------------------------------------------------------------
alter table public.tracker_students
  add column pending_subscription_alert boolean not null default false;

create or replace function public.touch_subscription_finished_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.total_lessons_remaining > 0 then
    new.pending_subscription_alert := false;
    return new;
  end if;

  if new.total_lessons_remaining = 0 and old.total_lessons_remaining <> 0
     and not coalesce(old.pending_subscription_alert, false) then
    new.pending_subscription_alert := true;
    insert into public.urgent_tasks (type, student_id, teacher_id, milestone, milestone_reached_at, status)
    values ('SUBSCRIPTION_FINISHED', new.id, new.teacher_id, 0, now(), 'NEW')
    on conflict (student_id, milestone, type) do update
      set status = 'NEW', milestone_reached_at = now(), completed_at = null, completed_by = null;
  end if;

  return new;
end;
$$;

create trigger tracker_students_touch_subscription_alert
  before update on public.tracker_students
  for each row execute function public.touch_subscription_finished_alert();

-- Extinde send_overdue_diploma_alerts() (functia existenta, ruleaza deja zilnic prin pg_cron)
-- ca, pe langa webhook-ul Pabbly de azi (neschimbat), sa deschida si task-ul de admin
-- DIPLOMA_NOT_SENT - dedublicat automat de constrangerea unique (student_id, milestone, type)
-- de mai sus, la fel cum diploma_overdue_alert_sent_at dedubleaza deja webhook-ul. Fara snapshot
-- de diploma (diploma_* raman null) - diploma inca nu a fost generata/finalizata.
create or replace function public.send_overdue_diploma_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select s.id, s.name as student_name, s.teacher_id, s.pending_diploma_milestone,
           s.pending_diploma_milestone_at,
           coalesce(nullif(p.full_name, ''), p.email) as teacher_name
    from public.tracker_students s
    join public.profiles p on p.id = s.teacher_id
    where s.deleted_at is null
      and s.pending_diploma_milestone is not null
      and current_date >= public.add_business_days(s.pending_diploma_milestone_at::date, 3)
      and s.diploma_overdue_alert_sent_at is null
  loop
    perform net.http_post(
      url := 'https://connect.pabbly.com/webhook-listener/webhook/IjU3NjIwNTY5MDYzMzA0MzM1MjZiNTUzMyI_3D_pc/IjU3NjcwNTY4MDYzNjA0M2Q1MjZjNTUzMjUxMzMi_pc',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'nume_copil', r.student_name,
        'nume_profesor', r.teacher_name,
        'data_cererii', r.pending_diploma_milestone_at,
        'mesaj_alerta', 'Profesorul nu a trimis diploma de 3 zile lucrătoare. Te rugăm să ceri diploma.'
      )
    );

    insert into public.urgent_tasks (type, student_id, teacher_id, milestone, milestone_reached_at)
    values ('DIPLOMA_NOT_SENT', r.id, r.teacher_id, r.pending_diploma_milestone, r.pending_diploma_milestone_at)
    on conflict (student_id, milestone, type) do nothing;

    update public.tracker_students set diploma_overdue_alert_sent_at = now() where id = r.id;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 15b. ROLLBACK PRAG DIPLOMA (profesorul anuleaza din greseala o prezenta care scade
--    numarul total sub un prag deja atins - vezi supabase/migrations/add_diploma_milestone_rollback.sql
--    pentru comentariul complet de business.)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 16. CURATARE AUTOMATA URGENT_TASKS (4 LUNI)
--    Vezi supabase/migrations/add_urgent_tasks_cleanup_cron.sql pentru comentariul complet.
-- ----------------------------------------------------------------------------
create or replace function public.cleanup_old_urgent_tasks()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.urgent_tasks where created_at < now() - interval '4 months';
$$;

grant execute on function public.cleanup_old_urgent_tasks() to postgres, service_role;

select cron.schedule(
  'cleanup-old-urgent-tasks-daily',
  '0 4 * * *',
  $$select public.cleanup_old_urgent_tasks();$$
);

-- ----------------------------------------------------------------------------
-- 17. ARHIVARE AUTOMATA CLASE FARA NICIUN ELEV ACTIV
--    Vezi supabase/migrations/add_group_zero_active_students_archive.sql pentru comentariul
--    complet de business. DIFERITA de sectiunea 10 (arhivare prin inactivitate, deleted_at/
--    Urna) - is_archived ascunde clasa COMPLET din contul profesorului (nu apare in Urna),
--    vizibila doar in "Arhivă Clase" (Admin), de indata ce ultimul elev activ pleaca.
-- ----------------------------------------------------------------------------
alter table public.tracker_groups add column if not exists is_archived boolean not null default false;

create index if not exists tracker_groups_is_archived_idx on public.tracker_groups (teacher_id, is_archived);

create or replace function public.sync_group_archive_status(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tracker_groups g
  set is_archived = not exists (
    select 1 from public.tracker_students s
    where s.group_id = p_group_id and s.deleted_at is null and s.status <> 'dropped_out'
  )
  where g.id = p_group_id and g.deleted_at is null;
end;
$$;

grant execute on function public.sync_group_archive_status(uuid) to authenticated;

create or replace function public.trg_sync_group_archive_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.sync_group_archive_status(new.group_id);
    return new;
  end if;
  if old.group_id is distinct from new.group_id then
    perform public.sync_group_archive_status(old.group_id);
  end if;
  perform public.sync_group_archive_status(new.group_id);
  return new;
end;
$$;

drop trigger if exists tracker_students_sync_archive on public.tracker_students;
create trigger tracker_students_sync_archive
  after insert or update of group_id, status, deleted_at on public.tracker_students
  for each row execute function public.trg_sync_group_archive_status();
