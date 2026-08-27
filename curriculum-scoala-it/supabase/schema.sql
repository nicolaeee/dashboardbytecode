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

-- Transfer clasa intre profesori (Panoul Admin -> Editeaza Clasa). teacher_id e
-- denormalizat pe tracker_students/tracker_lessons/tracker_attendance (nu doar derivat
-- prin group_id), deci un transfer trebuie sa actualizeze toate 4 tabelele impreuna,
-- intr-o singura tranzactie - vezi supabase/migrations/add_transfer_class_teacher.sql.
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
  update public.tracker_lessons set teacher_id = p_new_teacher_id where group_id = p_group_id;
  update public.tracker_attendance set teacher_id = p_new_teacher_id
    where lesson_id in (select id from public.tracker_lessons where group_id = p_group_id);
end;
$$;

grant execute on function public.transfer_class_teacher(uuid, uuid) to authenticated;

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
      'lunar_4', 'integral_16', 'integral_32', 'integral_48'
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
  type                 text not null check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS')),
  status               text not null default 'NEW' check (status in ('NEW', 'IN_PROGRESS', 'COMPLETED')),
  student_id           uuid not null references public.tracker_students(id) on delete cascade,
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

-- Mesaj mai amplu (vezi supabase/migrations/update_diploma_parent_message_template.sql):
-- salut in functie de ora locala (Buna ziua/Buna seara), continut celebrator randomizat
-- (aceleasi 8 variante), apoi o incheiere unica (scuze pentru asteptare, diploma atasata,
-- semnatura echipei) - nu mai repetata separat in fiecare varianta.
create or replace function public.random_diploma_parent_message(p_first_name text, p_course_label text)
returns text language sql volatile as $$
  select
    (case when extract(hour from (now() at time zone 'Europe/Bucharest')) < 18
       then 'Bună ziua,' else 'Bună seara,' end)
    || E'\n\n' ||
    (array[
      format('🎉 Felicitări, %1$s! Suntem tare mândri de el pentru această reușită! A finalizat cu succes o nouă etapă din aventura lui la %2$s și ne bucurăm enorm să îl vedem cum evoluează, învață și prinde tot mai multă încredere. 🌟

Este o bucurie să îl avem alături de noi și abia așteptăm să vedem ce lucruri minunate va descoperi în continuare! 🚀', p_first_name, p_course_label),
      format('🌟 Vești minunate despre %1$s! A dus la capăt cu brio o nouă etapă din călătoria lui la %2$s. Suntem atât de mândri de progresul și determinarea lui! 🎉

Mulțumim că ne sunteți alături - abia așteptăm să vedem ce va cuceri în continuare! 💫', p_first_name, p_course_label),
      format('🚀 %1$s tocmai a bifat un nou pas important la %2$s! Ne umple de bucurie să îl vedem cum crește, învață lucruri noi și capătă din ce în ce mai multă încredere în el. 🎉

Suntem recunoscători că face parte din povestea noastră și abia așteptăm continuarea aventurii lui! 🌟', p_first_name, p_course_label),
      format('🎊 O reușită minunată pentru %1$s! A finalizat cu succes o nouă etapă la %2$s și e clar că progresul lui e uriaș. Suntem tare mândri de el! 🌈

Mulțumim că sunteți alături de noi în această călătorie - urmează lucruri și mai frumoase! ✨', p_first_name, p_course_label),
      format('🌈 Vești superbe despre %1$s! A trecut cu bine de o nouă etapă din aventura lui la %2$s, iar entuziasmul și implicarea lui ne bucură enorm. 🎉

Este o plăcere să îl vedem evoluând - abia așteptăm să vedem ce urmează! 🚀', p_first_name, p_course_label),
      format('✨ %1$s a mai făcut un pas mare înainte la %2$s! Suntem tare mândri de reușita lui și de tot progresul făcut până acum. 🎉

Vă mulțumim că sunteți alături de noi în această călătorie - urmează lucruri minunate! 🌟', p_first_name, p_course_label),
      format('🎉 Ce reușită frumoasă pentru %1$s! A încheiat cu succes o nouă etapă la %2$s și îl vedem din ce în ce mai încrezător și entuziasmat. 🌟

Ne bucurăm enorm să facem parte din parcursul lui - abia așteptăm continuarea! 🚀', p_first_name, p_course_label),
      format('🌟 Felicitări din suflet, %1$s! A dus la bun sfârșit o nouă etapă din aventura lui la %2$s, iar progresul lui ne umple de mândrie. 🎉

Mulțumim că sunteți alături de noi - urmează multe momente minunate! ✨', p_first_name, p_course_label)
    ])[1 + floor(random() * 8)::int]
    || E'\n\n' ||
    format('Ne cerem scuze pentru orice mic deranj cauzat de timpul de așteptare până la primirea acesteia - vă mulțumim pentru răbdare! 📎 Atașăm aici și diploma lui %1$s.

O zi minunată vă dorim, din partea întregii echipe ByteCode School! 💛', p_first_name);
$$;

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

  -- Task 2 - "🪙 Trimite monedele virtuale": DOAR cand recompensa e bani virtuali. Task
  -- independent (status propriu), fara mesaj pentru parinte si fara snapshot de diploma -
  -- nu are butoane de diploma (vezi TaskUriUrgenteClient.tsx). Idempotent ca si task-ul 1,
  -- prin acelasi unique (student_id, milestone, type).
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
