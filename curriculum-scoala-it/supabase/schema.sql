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
  course       text check (course in ('coblocks', 'python', 'roblox', 'alfabetizare', 'unity', 'delighted')),  -- leaga grupa de folderul de sabloane de diploma
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
  lesson_date    date not null default current_date,
  lesson_time    text,   -- 'HH:MM', optional
  format         text not null default 'grup' check (format in ('grup', 'individual')),
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
  updated_at     timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create index on public.tracker_groups (teacher_id);
create index on public.tracker_students (teacher_id);
create index on public.tracker_students (group_id);
create index on public.tracker_lessons (group_id);
create index on public.tracker_attendance (lesson_id);
create index on public.tracker_attendance (student_id);

create trigger tracker_attendance_touch before update on public.tracker_attendance
  for each row execute function public.touch_updated_at();

alter table public.tracker_groups     enable row level security;
alter table public.tracker_students   enable row level security;
alter table public.tracker_lessons    enable row level security;
alter table public.tracker_attendance enable row level security;

-- Izolare stricta: fiecare profesor vede si scrie doar propriile grupe/elevi/lectii/prezenta.
create policy "profesorul isi gestioneaza grupele" on public.tracker_groups
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza elevii" on public.tracker_students
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza lectiile" on public.tracker_lessons
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza prezenta" on public.tracker_attendance
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

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
