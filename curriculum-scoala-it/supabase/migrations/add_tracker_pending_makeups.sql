-- ============================================================================
--  TASK-URI URGENTE: recuperari neefectuate per elev, alimentat din bifarea
--  "Absent" la o lectie (vezi setAttendanceStatus in ProgressTracker.tsx).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Numar de recuperari neefectuate: +1 cand elevul e marcat "Absent" la o lectie,
-- -1 (fara sa scada sub 0) cand absenta e anulata sau recuperarea e rezolvata
-- din dashboard ("Task-uri Urgente").
alter table public.tracker_students add column if not exists pending_makeups int not null default 0;
