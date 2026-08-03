-- "Neefectuata" (0 prezenti): daca absolut toti elevii activi ai grupei au fost marcati
-- explicit Absent la o lectie, acea lectie NU se mai numara ca ora predata/achitata.
--
-- is_taught e recalculat automat la fiecare marcare de prezenta (vezi setAttendanceStatus in
-- ProgressTracker.tsx) - devine false doar cand ultimul elev nemarcat e marcat Absent (toti
-- absenti), si revine automat la true daca profesorul corecteaza ulterior pe Prezent/Recuperat.
--
-- Prezentele elevilor raman salvate normal in tracker_attendance - alertele de recuperare
-- (pending_makeups, cardul "Recuperare necesara") functioneaza exact ca inainte, neschimbate.
-- Doar Payslip-ul din /registru exclude aceste lectii din contorul de ore predate.
alter table public.tracker_lessons add column is_taught boolean not null default true;

-- Backfill: pentru lectiile existente, o lectie e considerata "neefectuata" daca are cel putin
-- o inregistrare de prezenta si absolut toate sunt 'absent' (nicio prezenta/recuperare).
update public.tracker_lessons l
set is_taught = false
where exists (select 1 from public.tracker_attendance a where a.lesson_id = l.id)
  and not exists (
    select 1 from public.tracker_attendance a2
    where a2.lesson_id = l.id and a2.status <> 'absent'
  );
