-- ============================================================================
--  PROGRESS TRACKER — prezenta si stelute separate pe lectie, + acces admin global
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Diploma se trimite la fiecare multiplu de 16 lectii tinute de grupa (16, 32, 48...).
-- diploma_milestone retine cel mai mare multiplu deja notificat/trimis.
alter table public.tracker_groups add column if not exists diploma_milestone int not null default 0;

-- O lectie/sedinta tinuta pentru o grupa (numerotata secvential in cadrul grupei).
create table public.tracker_lessons (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references public.profiles(id) on delete cascade,
  group_id       uuid not null references public.tracker_groups(id) on delete cascade,
  session_number int  not null,
  lesson_date    date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (group_id, session_number)
);

-- Prezenta + steluta per elev, per lectie. Complet separate:
-- prezenta (status) se inregistreaza mereu; steluta (has_star) se acorda strict daca elevul
-- si-a facut tema - profesorul o poate adauga oricand retroactiv pe o lectie anterioara.
create table public.tracker_attendance (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  lesson_id   uuid not null references public.tracker_lessons(id) on delete cascade,
  student_id  uuid not null references public.tracker_students(id) on delete cascade,
  status      text not null default 'absent' check (status in ('present', 'absent', 'made_up')),
  has_star    boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create index on public.tracker_lessons (group_id);
create index on public.tracker_attendance (lesson_id);
create index on public.tracker_attendance (student_id);

create trigger tracker_attendance_touch before update on public.tracker_attendance
  for each row execute function public.touch_updated_at();

alter table public.tracker_lessons    enable row level security;
alter table public.tracker_attendance enable row level security;

-- Izolare stricta, la fel ca la grupe/elevi: fiecare profesor vede/scrie doar propriile date.
create policy "profesorul isi gestioneaza lectiile" on public.tracker_lessons
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul isi gestioneaza prezenta" on public.tracker_attendance
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- Adminul are vizibilitate si acces complet peste toate grupele/elevii/lectiile/prezenta
-- tuturor profesorilor (necesar pentru panoul de admin si alerta de diploma la nivel global).
create policy "adminul gestioneaza toate grupele" on public.tracker_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toti elevii" on public.tracker_students
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toate lectiile" on public.tracker_lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "adminul gestioneaza toata prezenta" on public.tracker_attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.tracker_lessons;
alter publication supabase_realtime add table public.tracker_attendance;
