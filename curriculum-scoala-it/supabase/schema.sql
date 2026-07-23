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
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table public.tracker_students (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  group_id    uuid not null references public.tracker_groups(id) on delete cascade,
  name        text not null,
  progress    int  not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index on public.tracker_groups (teacher_id);
create index on public.tracker_students (teacher_id);
create index on public.tracker_students (group_id);

alter table public.tracker_groups   enable row level security;
alter table public.tracker_students enable row level security;

-- Izolare stricta: fiecare profesor/admin vede si scrie doar propriile grupe/elevi.
create policy "profesorul isi gestioneaza grupele" on public.tracker_groups
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza elevii" on public.tracker_students
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

alter publication supabase_realtime add table public.tracker_groups;
alter publication supabase_realtime add table public.tracker_students;

-- ----------------------------------------------------------------------------
-- 10. PRIMUL ADMINISTRATOR
--    Creeaza-ti contul din Supabase -> Authentication -> Add user,
--    apoi ruleaza linia de mai jos cu emailul tau:
-- ----------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'adresa@scoala.ro';
