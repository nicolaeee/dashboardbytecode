-- ============================================================================
--  TELEFON PROFESOR (Panoul de Profesori) - folosit si in webhook-urile de diploma
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.profiles add column if not exists phone text;
