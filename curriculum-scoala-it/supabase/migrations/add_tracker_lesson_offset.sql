-- ============================================================================
--  NUMEROTARE COMPACTA PE MODULE (M{x} / L{y}) - decalaj manual per elev
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Decalaj manual de lectii, folosit ca punct de pornire pentru elevii cu istoric dinainte
-- de Tracker (vezi src/lib/lessonNumbering.ts). Se aduna la numarul de prezente+recuperari
-- inregistrate in aplicatie ca sa dea numarul total de lectii, din care se deduce "M{x} / L{y}".
alter table public.tracker_students add column if not exists lesson_offset int not null default 0;
