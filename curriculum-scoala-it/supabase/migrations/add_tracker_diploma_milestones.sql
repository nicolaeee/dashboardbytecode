-- ============================================================================
--  TASK-URI URGENTE: diploma per elev, la fiecare 16 prezente (istoric + curent)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Pragul curent (multiplu de 16) pentru care s-a afisat popup-ul de celebrare si asteapta
-- sa fie trimisa diploma - null cat timp elevul nu are niciun task deschis.
alter table public.tracker_students add column if not exists pending_diploma_milestone int;

-- Ultimul prag pentru care diploma a fost deja marcata ca trimisa - ca sa nu redeclansam
-- popup-ul pentru acelasi multiplu de doua ori.
alter table public.tracker_students add column if not exists last_diploma_issued_milestone int not null default 0;
