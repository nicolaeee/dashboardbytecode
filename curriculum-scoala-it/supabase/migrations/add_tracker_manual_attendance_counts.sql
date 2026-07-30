-- ============================================================================
--  PREZENTE/ABSENTE MANUALE (formularul "Editeaza Elev" din Progress Tracker)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Suprascriere manuala a totalului de prezente/absente (acelasi tipar ca `progress`
-- pentru stelute) - folosita pentru elevi cu istoric dinainte de Tracker sau pentru
-- corectii facute direct de admin/profesor din Fisa Elevului.
alter table public.tracker_students add column if not exists presence_count int not null default 0;
alter table public.tracker_students add column if not exists absence_count  int not null default 0;
