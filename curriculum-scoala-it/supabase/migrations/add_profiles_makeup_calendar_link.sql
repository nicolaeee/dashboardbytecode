-- ============================================================================
--  LINK RECUPERARI (buton "📅 Link Recuperari" din dashboard-ul profesorului) -
--  link catre calendarul propriu de recuperari, editabil de profesor.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.profiles add column if not exists makeup_calendar_link text;
