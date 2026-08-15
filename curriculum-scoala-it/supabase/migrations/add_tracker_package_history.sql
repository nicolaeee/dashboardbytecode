-- ============================================================================
--  ISTORIC PACHET LECTII - pentru elevii care aveau deja lectii efectuate
--  inainte de folosirea platformei. Ruleaza acest fisier o singura data in
--  Supabase -> SQL Editor.
--
--  total_package_lessons        = numarul total de lectii din pachetul/abonamentul
--                                  achizitionat (ex: 48).
--  already_completed_lessons    = lectii efectuate deja de elev INAINTE de
--                                  platforma (ex: 66).
--  La salvarea acestor doua campuri din "Editeaza Elev" (ProgressTracker.tsx,
--  handleEditStudent), soldul total_lessons_remaining se recalculeaza automat:
--  total_lessons_remaining = total_package_lessons - already_completed_lessons.
-- ============================================================================

alter table public.tracker_students
  add column total_package_lessons int not null default 0,
  add column already_completed_lessons int not null default 0;
