-- ============================================================================
--  NOTIFICARI PARINTI (buton "Trimite Notificare" din Progress Tracker)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Telefonul parintelui (format Green API, ex: "40712345678@c.us"). GDPR: coloana e
-- exclusa explicit din fetch-ul folosit de profesori (vezi progress/page.tsx) - doar
-- adminul o citeste/scrie, din Fisa Elevului.
alter table public.tracker_students add column if not exists parent_phone text;
