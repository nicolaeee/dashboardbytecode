-- ============================================================================
--  ABONAMENTE / PACHETE - SISTEM PE BAZA DE SOLD DE LECTII
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Indiferent de tipul pachetului (Individual Lunar/Integral, Grup Lunar/Integral),
--  totul se reduce tehnic la total_lessons_remaining: numarul de lectii inca
--  neconsumate. Scade automat din aplicatie (vezi computeLessonBalanceDelta in
--  src/lib/attendanceTransition.ts si setAttendanceStatus in ProgressTracker.tsx)
--  la fiecare prima marcare a unei prezente (present/absent/made_up - o recuperare
--  NU consuma a doua oara aceeasi lectie deja scazuta la absenta initiala).
-- ============================================================================

alter table public.tracker_students
  add column subscription_type text
    check (subscription_type in ('individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral')),
  add column total_lessons_remaining int not null default 0;

-- ----------------------------------------------------------------------------
-- Jurnal de tranzactii pe soldul de lectii - auditeaza DOAR actiunile explicite
-- (ex: "Adauga lectii" cand parintele reinnoieste abonamentul), nu si consumul
-- automat de la fiecare prezenta (ar produce un rand per lectie tinuta, fara
-- beneficiu real - soldul curent + istoricul din tracker_attendance sunt deja
-- suficiente pentru a reconstitui consumul).
-- ----------------------------------------------------------------------------
create table public.tracker_lesson_transactions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.tracker_students(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  delta         int not null,
  reason        text not null check (reason in ('purchase', 'adjustment')),
  balance_after int not null,
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index on public.tracker_lesson_transactions (student_id);
create index on public.tracker_lesson_transactions (teacher_id);

alter table public.tracker_lesson_transactions enable row level security;

-- Acelasi tipar ca "profesorul isi gestioneaza elevii" (schema.sql sectiunea 9):
-- profesorul citeste/scrie doar tranzactiile propriilor elevi.
create policy "profesorul isi gestioneaza tranzactiile de lectii" on public.tracker_lesson_transactions
  for all to authenticated using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.tracker_students s where s.id = tracker_lesson_transactions.student_id and s.teacher_id = auth.uid())
  );

create policy "adminul gestioneaza toate tranzactiile de lectii" on public.tracker_lesson_transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
