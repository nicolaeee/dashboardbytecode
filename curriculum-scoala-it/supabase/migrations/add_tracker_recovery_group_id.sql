-- ============================================================================
--  RECUPERARE DE GRUP: leaga mai multe randuri de tracker_attendance (elevi
--  diferiti, posibil din lectii diferite) intr-o SINGURA sesiune reala de
--  recuperare, cand profesorul confirma popup-ul "Este o recuperare de grup?"
--  din ProgressTracker.tsx.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- null = recuperare individuala (1-la-1) - fiecare rand conteaza separat in Payslip
-- (comportamentul de dinainte). Cand e setat (acelasi uuid generat client-side pe toate
-- randurile participantilor), TOATE randurile cu acelasi id conteaza impreuna ca O SINGURA
-- ora predata/platita in /registru (vezi Registru.tsx), desi fiecare elev in parte isi
-- recupereaza propria lectie ratata - pastreaza astfel legatura clara cine a participat.
alter table public.tracker_attendance add column if not exists recovery_group_id uuid;

create index if not exists tracker_attendance_recovery_group_id_idx
  on public.tracker_attendance (recovery_group_id);
