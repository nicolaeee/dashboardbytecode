-- ============================================================================
--  REPARARE ISTORIC: clasa individuala a elevului Iulian Andrei Ion, transferata de la
--  Iordache David la Puscasu Bogdan. Ruleaza DUPA
--  supabase/migrations/add_lesson_taught_by_history.sql, in Supabase -> SQL Editor.
--
--  Bogdan n-a tinut inca nicio lectie cu elevul (confirmat de admin), deci TOATE lectiile
--  existente ale clasei lui au fost tinute de David si trec inapoi in registrul lui David.
--
--  Siguranta - se opreste cu eroare, FARA sa schimbe nimic, daca:
--    - nu gaseste exact un elev "Iulian Andrei", un David si un Bogdan;
--    - clasa elevului nu e la Bogdan;
--    - clasa are mai mult de 1 elev activ (atunci nu e clasa individuala transferata, ci
--      poate o grupa a lui Bogdan - lectiile ei NU trebuie mutate la David).
--  NU atinge: soldul, steluțele, prezentele, progresul, nici clasa (ramane la Bogdan).
-- ============================================================================
do $$
declare
  v_david uuid; v_bogdan uuid; v_group uuid; v_group_teacher uuid; n int;
begin
  select count(*), min(id::text)::uuid into n, v_david from public.profiles
    where full_name ilike '%iordache%' and full_name ilike '%david%';
  if n <> 1 then raise exception 'Am gasit % profesori "Iordache David" (trebuie 1).', n; end if;

  select count(*), min(id::text)::uuid into n, v_bogdan from public.profiles
    where full_name ilike '%bogdan%' and (full_name ilike '%pușcașu%' or full_name ilike '%puscasu%' or full_name ilike '%pușcasu%' or full_name ilike '%puscașu%');
  if n <> 1 then raise exception 'Am gasit % profesori "Puscasu Bogdan" (trebuie 1).', n; end if;

  select count(*), min(group_id::text)::uuid into n, v_group from public.tracker_students
    where name ilike '%iulian%' and name ilike '%andrei%' and deleted_at is null;
  if n <> 1 then raise exception 'Am gasit % elevi "Iulian Andrei" activi (trebuie 1).', n; end if;

  select teacher_id into v_group_teacher from public.tracker_groups where id = v_group;
  if v_group_teacher is distinct from v_bogdan then
    raise exception 'Clasa elevului nu este la Bogdan - nu modific nimic.';
  end if;

  select count(*) into n from public.tracker_students where group_id = v_group and deleted_at is null;
  if n <> 1 then
    raise exception 'Clasa elevului are % elevi activi (nu e individuala) - nu modific nimic.', n;
  end if;

  update public.tracker_lessons set taught_by = v_david where group_id = v_group;

  update public.tracker_attendance a set taught_by = v_david
    from public.tracker_lessons l
    where l.id = a.lesson_id and l.group_id = v_group;
end $$;

-- Verificare: lectiile clasei elevului si cui apartin acum in registru.
select g.group_name as clasa, l.session_number as sedinta, l.lesson_date as data_lectie,
       a.status, a.star_count as stelute, p.full_name as in_registrul_lui
from public.tracker_students s
join public.tracker_groups g on g.id = s.group_id
join public.tracker_lessons l on l.group_id = g.id
left join public.tracker_attendance a on a.lesson_id = l.id and a.student_id = s.id
left join public.profiles p on p.id = l.taught_by
where s.name ilike '%iulian%' and s.name ilike '%andrei%' and s.deleted_at is null
order by l.lesson_date, l.session_number;
