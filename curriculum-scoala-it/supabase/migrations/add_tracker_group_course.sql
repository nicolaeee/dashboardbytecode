-- ============================================================================
--  CURS PE GRUPA - leaga o grupa de folderul de sabloane de diploma corect
--  (CoBlocks / Python / Roblox), pentru filtrarea automata din modalul de
--  generare a diplomelor.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.tracker_groups add column if not exists course text check (course in ('coblocks', 'python', 'roblox'));
