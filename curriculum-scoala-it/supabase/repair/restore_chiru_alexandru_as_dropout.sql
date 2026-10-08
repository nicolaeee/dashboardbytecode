-- ============================================================================
--  Chiru Alexandru a fost sters din greseala (mutat in Urna Elevi) in loc sa fie marcat
--  "Abandon". Il scoatem din urna si il marcam Abandon, exact ca butonul "Abandon" din Fisa
--  Elevului. Ruleaza o singura data in Supabase -> SQL Editor.
--
--  Stergerea din Tracker e doar "soft" (deleted_at) - prezentele, steluțele, lectiile si
--  abonamentul lui au ramas neatinse, deci se recupereaza integral. Daca a fost sters si
--  PERMANENT din urna (🗑️ a doua oara), randul nu mai exista si scriptul nu gaseste nimic.
--
--  Siguranta: modifica DOAR daca exista exact un elev sters cu "chiru" + "alexandru" in nume;
--  altfel nu schimba nimic si afiseaza un mesaj (vezi tabul "Messages"/rezultatul).
--  Trigger-ul sync_group_archive_status ruleaza automat: daca era ultimul elev activ al
--  clasei, clasa trece in "Arhivă Clase" - la fel ca la un Abandon facut din aplicatie.
-- ============================================================================
do $$
declare
  v_count int;
  v_id uuid;
begin
  select count(*), min(id::text)::uuid into v_count, v_id
  from public.tracker_students
  where deleted_at is not null
    and lower(name) like '%chiru%' and lower(name) like '%alexandru%';

  if v_count = 0 then
    raise notice 'Nu am gasit niciun elev sters cu numele Chiru Alexandru (poate a fost sters permanent din urna, sau numele e scris altfel).';
    return;
  elsif v_count > 1 then
    raise notice 'Am gasit % elevi stersi care se potrivesc - nu modific nimic, restaureaza-l manual din Urna Elevi.', v_count;
    return;
  end if;

  update public.tracker_students
  set deleted_at = null,
      status = 'dropped_out',
      status_changed_at = now(),
      status_note = 'Abandon (restaurat dupa stergere accidentala)'
  where id = v_id;

  raise notice 'Chiru Alexandru a fost restaurat si marcat Abandon.';
end $$;

-- Verificare: elevul, clasa, profesorul si statusul lui dupa reparatie.
select s.name as elev, s.status, s.deleted_at, s.progress as stelute, g.group_name as clasa,
       g.is_archived as clasa_arhivata,
       coalesce(nullif(trim(p.full_name), ''), p.email) as profesor
from public.tracker_students s
join public.tracker_groups g on g.id = s.group_id
left join public.profiles p on p.id = s.teacher_id
where lower(s.name) like '%chiru%' and lower(s.name) like '%alexandru%';
