-- ============================================================================
--  ARHIVARE AUTOMATA CLASE FARA NICIUN ELEV ACTIV
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  (Continutul e adaugat si in schema.sql, pentru instalari noi de la zero.)
--
--  DIFERITA de arhivarea prin inactivitate (add_group_inactivity_archive.sql,
--  care foloseste deleted_at / Urna - restaurabila de profesor, dupa 6 luni
--  fara nicio lectie noua). Aceasta arhivare foloseste un flag NOU, is_archived,
--  cu semantica diferita: clasa dispare COMPLET din contul profesorului (nu
--  mai apare nici macar in Urna) de indata ce ultimul ei elev activ pleaca
--  (Abandon sau transfer la alta clasa) - si devine vizibila DOAR intr-o
--  sectiune dedicata a Adminului ("Arhivă Clase", vezi
--  src/app/admin/clase-arhivate).
--
--  Nu sterge niciun rand - clasa si toti elevii ei raman intacti in baza de
--  date (progresul/prezentele/steluțele nu sunt atinse), doar flag-ul
--  is_archived controleaza ce vede profesorul.
-- ============================================================================

alter table public.tracker_groups add column if not exists is_archived boolean not null default false;

create index if not exists tracker_groups_is_archived_idx on public.tracker_groups (teacher_id, is_archived);

-- Recalculeaza is_archived pentru O clasa, pe baza numarului de elevi ACTIVI ramasi
-- (deleted_at null si status <> 'dropped_out'). Un elev transferat la alta clasa nu mai are
-- group_id-ul acesta, deci nu se numara automat - nu trebuie tratat separat. Simetric: daca
-- un elev activ ajunge/revine in clasa (transfer catre ea sau reactivare din Abandon), clasa
-- se DEZARHIVEAZA automat - nu ramane blocata permanent dupa un singur eveniment.
-- Clasele deja sterse manual (Urna, deleted_at not null) nu sunt atinse aici - au propriul
-- ciclu de viata, separat de arhivarea automata.
create or replace function public.sync_group_archive_status(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tracker_groups g
  set is_archived = not exists (
    select 1 from public.tracker_students s
    where s.group_id = p_group_id and s.deleted_at is null and s.status <> 'dropped_out'
  )
  where g.id = p_group_id and g.deleted_at is null;
end;
$$;

grant execute on function public.sync_group_archive_status(uuid) to authenticated;

-- Trigger: recalculeaza automat clasa VECHE (daca elevul tocmai a fost transferat/scos din ea)
-- SI clasa NOUA (daca elevul tocmai a fost mutat/adaugat aici sau i s-a schimbat statusul) -
-- acopera UNIFORM toate caile posibile (schimbare status din Fisa Elevului, transfer_student_
-- teacher, restaurare din Urna), fara sa fie nevoie sa fie apelata manual din fiecare loc din
-- cod aplicatiei. Ruleaza si in interiorul functiilor SECURITY DEFINER existente (triggerele
-- nu sunt suprimate de contextul functiei care a facut UPDATE-ul).
create or replace function public.trg_sync_group_archive_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.sync_group_archive_status(new.group_id);
    return new;
  end if;
  if old.group_id is distinct from new.group_id then
    perform public.sync_group_archive_status(old.group_id);
  end if;
  perform public.sync_group_archive_status(new.group_id);
  return new;
end;
$$;

drop trigger if exists tracker_students_sync_archive on public.tracker_students;
create trigger tracker_students_sync_archive
  after insert or update of group_id, status, deleted_at on public.tracker_students
  for each row execute function public.trg_sync_group_archive_status();

-- Backfill: recalculeaza is_archived pentru toate clasele existente, nesterse - in caz ca vreo
-- clasa veche a ramas deja fara niciun elev activ, dinainte de acest trigger.
do $$
declare r record;
begin
  for r in select id from public.tracker_groups where deleted_at is null loop
    perform public.sync_group_archive_status(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
