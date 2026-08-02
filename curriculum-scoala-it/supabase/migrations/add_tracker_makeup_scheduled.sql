-- ============================================================================
--  STARE "PROGRAMAT" PENTRU RECUPERARI (Task-uri Urgente -> card "Recuperare necesara")
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  100% non-distructiv: adauga o singura coloana noua, cu valoare implicita - nu
--  atinge niciun rand/tabel/coloana existenta.
-- ============================================================================

alter table public.tracker_students
  add column if not exists is_scheduled boolean not null default false;
