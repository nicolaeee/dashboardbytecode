-- ============================================================================
--  PERMITE CURSURI CUSTOM PE CLASA (nu doar lista fixa coblocks/python/roblox/
--  alfabetizare/unity) - necesar pentru "+ Alt curs..." din formularul de
--  Adauga/Editeaza Clasa (Progress Tracker).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  100% non-distructiv: elimina DOAR constrangerea CHECK de pe tracker_groups.course
--  (coloana ramane text, nullable) - nu atinge niciun rand/tabel/alta coloana.
--  Clasele existente cu course = 'coblocks'/'python'/etc. raman neschimbate; clasele
--  cu course = 'delighted' (eliminat din UI) raman valide in DB, doar nu mai pot fi
--  alese din nou din formular.
-- ============================================================================

alter table public.tracker_groups drop constraint if exists tracker_groups_course_check;
