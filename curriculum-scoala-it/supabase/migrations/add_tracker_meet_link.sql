-- ============================================================================
--  LINK GOOGLE MEET PE CLASA - profesorul il seteaza o data pe grupa (tracker_groups)
--  si il vede/editeaza direct din antetul clasei in Progress Tracker.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.tracker_groups add column if not exists meet_link text;
