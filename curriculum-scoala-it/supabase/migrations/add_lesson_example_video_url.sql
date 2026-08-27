-- ============================================================================
--  VIDEO SUPLIMENTAR "LECȚIE EXEMPLU" (rezultatul final, optional)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  Pe langa video_url (video-ul explicativ principal), lectia poate avea acum un al doilea
--  link video, optional, care arata rezultatul final - randat cu exact acelasi player ca
--  video_url (vezi lectie/[id]/page.tsx), doar cu eticheta "🎬 Lecție Exemplu" deasupra.
--  Aceeasi conventie ca video_url/homework_url: text default '' (nu null), gol = nesetat.
-- ============================================================================

alter table public.lessons add column if not exists example_video_url text default '';

notify pgrst, 'reload schema';
