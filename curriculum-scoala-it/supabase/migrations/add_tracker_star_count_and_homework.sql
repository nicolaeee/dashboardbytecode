-- ============================================================================
--  STELUTE NUMERICE (multiplicator per lectie) + TEMA PE LECTIE
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Steluta nu mai e boolean (facuta / nefacuta) - e un multiplicator 0-3 per lectie,
-- ca profesorul sa poata nota implicarea reala la tema. Migreaza has_star (boolean)
-- existent -> star_count (int: 0 sau 1), apoi elimina coloana veche.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_attendance' and column_name = 'has_star'
  ) then
    alter table public.tracker_attendance add column if not exists star_count int not null default 0;
    update public.tracker_attendance set star_count = 1 where has_star = true and star_count = 0;
    alter table public.tracker_attendance drop column has_star;
  else
    alter table public.tracker_attendance add column if not exists star_count int not null default 0;
  end if;
end $$;

-- Notita de tema pentru lectia respectiva (nu per elev) - editabila liber de profesor,
-- afisata langa selectorul de lectie din Progress Tracker.
alter table public.tracker_lessons add column if not exists homework_note text;
