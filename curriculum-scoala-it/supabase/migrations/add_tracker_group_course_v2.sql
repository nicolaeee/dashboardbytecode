-- ============================================================================
--  CURSURI NOI PE GRUPA - extinde constrangerea tracker_groups.course cu
--  cursurile noi pentru care exista acum sabloane in public/diplome:
--  Alfabetizare, Unity, Delighted (pe langa coblocks/python/roblox existente).
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.tracker_groups drop constraint if exists tracker_groups_course_check;
alter table public.tracker_groups add constraint tracker_groups_course_check
  check (course in ('coblocks', 'python', 'roblox', 'alfabetizare', 'unity', 'delighted'));
