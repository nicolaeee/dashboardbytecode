-- ============================================================================
--  PROGRESS TRACKER - grupe, elevi si progresul lor (stelute), izolate per cont
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

create table public.tracker_groups (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  group_name   text not null,
  module_count int  not null default 1,
  reward_type  text not null default 'stars',
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
