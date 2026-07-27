-- ============================================================================
--  NIVEL PROFESOR (Junior / Middle / Senior) - folosit in Panoul de Admin si
--  in pagina Roadmap (mesajul "Nivelul tau curent").
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
-- ============================================================================

alter table public.profiles add column if not exists level text not null default 'Junior';

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check
  check (level in ('Junior', 'Middle', 'Senior'));
