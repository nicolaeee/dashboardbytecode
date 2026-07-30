-- ============================================================================
--  CAMPURI AVANSATE ELEV: nume mic + telefoane/email-uri multiple parinti
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

-- Numele mic (folosit in notificarile catre parinti, spre deosebire de numele
-- complet din registru/tracker).
alter table public.tracker_students add column if not exists short_name text;

-- Pana la 5 telefoane / email-uri de parinte (format Green API pt telefoane,
-- ex: "40712345678@c.us" - sufixul se adauga automat la trimiterea notificarii).
-- GDPR: la fel ca vechea coloana parent_phone, sunt excluse explicit din
-- fetch-ul folosit de profesori (vezi progress/page.tsx) - doar adminul le
-- citeste/scrie, din Fisa Elevului.
alter table public.tracker_students add column if not exists parent_phones text[] not null default '{}';
alter table public.tracker_students add column if not exists parent_emails text[] not null default '{}';

-- Migreaza telefonul unic existent (daca a fost completat) in noul array, apoi
-- renunta la coloana veche - facut conditionat, ca migratia sa functioneze
-- indiferent daca add_tracker_parent_phone.sql a rulat deja sau nu.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_students' and column_name = 'parent_phone'
  ) then
    update public.tracker_students
    set parent_phones = array[parent_phone]
    where parent_phone is not null and parent_phone <> '';

    alter table public.tracker_students drop column parent_phone;
  end if;
end $$;
