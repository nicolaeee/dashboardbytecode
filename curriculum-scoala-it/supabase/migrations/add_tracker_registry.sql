-- ============================================================================
--  PAYSLIP AUTOMAT - inlocuieste Registru-ul manual (registry_entries).
--  Raportul /registru se genereaza acum STRICT din tracker_lessons +
--  tracker_attendance, fara nicio inregistrare separata facuta de profesor.
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.
--   Idempotent: sigur de rulat indiferent daca versiunea veche a acestui
--   fisier (cu tabelul registry_entries) a fost deja rulata sau nu.)
-- ============================================================================

-- Elimina tabelul de introducere manuala din versiunea anterioara - inlocuit complet.
drop table if exists public.registry_entries;

-- Siguranta: migrare diploma_sent (boolean) -> diploma_milestone (int), pentru cazul
-- in care doar prima migrare (add_tracker_attendance.sql, varianta veche) a rulat.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_groups' and column_name = 'diploma_sent'
  ) then
    alter table public.tracker_groups add column if not exists diploma_milestone int not null default 0;
    update public.tracker_groups set diploma_milestone = 16 where diploma_sent = true and diploma_milestone = 0;
    alter table public.tracker_groups drop column diploma_sent;
  else
    alter table public.tracker_groups add column if not exists diploma_milestone int not null default 0;
  end if;
end $$;

-- Fiecare lectie e clasificata AUTOMAT la creare, dupa numarul de elevi din grupa
-- (1 elev = 'individual', >1 = 'grup') - profesorul nu alege manual tipul.
alter table public.tracker_lessons add column if not exists format text not null default 'grup' check (format in ('grup', 'individual'));
alter table public.tracker_lessons add column if not exists lesson_time text;  -- 'HH:MM', optional

-- O recuperare (sesiune 1-la-1) are propria data/ora de facturare - diferita de data
-- lectiei ratate initial - completata cand profesorul marcheaza elevul "Recuperat".
alter table public.tracker_attendance add column if not exists recovery_date date;
alter table public.tracker_attendance add column if not exists recovery_time text;  -- 'HH:MM', optional
