-- ============================================================================
--  PROGRESS TRACKER - ziua saptamanii si ora la care se tine clasa
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Coloanele sunt adaugate si in schema.sql / migrations/add_progress_tracker.sql
--   pentru instalari noi de la zero.)
-- ============================================================================

alter table public.tracker_groups
  add column if not exists day_of_week text,
  add column if not exists time_of_day text;
