-- ============================================================================
--  REPARARE: elevul Luca Marinescu, la Puscasu Bogdan - nu se mai puteau adauga lectii
--  in clasa lui, iar elevul trebuie sa ajunga la "Nivel 3" cu 0 steluțe (0/16 pe card).
--  Ruleaza o singura data in Supabase -> SQL Editor. Atinge STRICT elevul Luca Marinescu si
--  clasa lui - niciun alt elev, clasa sau profesor.
--
--  Ce face (fiecare pas e idempotent - rularea de doua ori nu strica nimic):
--    1. Proprietar (teacher_id) aliniat pe clasa lui Luca: elevul, lectiile si prezentele
--       clasei care au ramas pe alt profesor (ex. dupa un transfer incomplet) trec la Bogdan.
--       Lectiile "invizibile" (RLS: profesorul vede doar teacher_id = el) faceau ca butonul "+"
--       sa calculeze un session_number deja folosit -> "Eroare la crearea lectiei" (unique
--       group_id+session_number). taught_by NU se atinge -> registrul/payslip-ul ramane la fel
--       (aceeasi regula ca transfer_class_teacher).
--    2. Clasa: dezarhivata daca are elevi activi (sync_group_archive_status - aceeasi functie
--       ca trigger-ul automat).
--    3. Nivel 3 cu 0 steluțe: progress = 32 (Nivel = progress/16 + 1 -> 3, vezi getLevelInfo
--       in ProgressTracker.tsx), legacy_module_stars = 0 si steluțele (star_count) lui Luca
--       puse pe 0 DOAR pe lectiile modulului curent al clasei (cele numarate pe contorul X/16).
--       Prezentele, absentele, soldul de lectii, pozitia M/L si diplomele NU se ating.
--
--  Siguranta - se opreste cu eroare, FARA sa schimbe nimic, daca:
--    - nu gaseste exact un profesor "Puscasu Bogdan" sau exact un elev "Luca Marinescu"
--      (nesters);
--    - clasa lui Luca nu e a lui Bogdan sau e stearsa (Urna);
--    - Luca e marcat Abandon (trebuie intai "Reactivează" din Fisa Elevului).
-- ============================================================================
do $$
declare
  v_bogdan uuid; v_student uuid; v_status text; v_group uuid;
  v_group_teacher uuid; v_group_deleted timestamptz; v_module int; n int;
begin
  select count(*), min(id::text)::uuid into n, v_bogdan from public.profiles
    where full_name ilike '%bogdan%' and (full_name ilike '%pușcașu%' or full_name ilike '%puscasu%' or full_name ilike '%pușcasu%' or full_name ilike '%puscașu%');
  if n <> 1 then raise exception 'Am gasit % profesori "Puscasu Bogdan" (trebuie 1).', n; end if;

  select count(*), min(id::text)::uuid into n, v_student from public.tracker_students
    where name ilike '%luca%' and name ilike '%marinescu%' and deleted_at is null;
  if n <> 1 then raise exception 'Am gasit % elevi "Luca Marinescu" nesterși (trebuie 1).', n; end if;

  select status, group_id into v_status, v_group from public.tracker_students where id = v_student;
  if v_status = 'dropped_out' then
    raise exception 'Luca Marinescu e marcat Abandon - reactiveaza-l din Fisa Elevului, apoi ruleaza din nou.';
  end if;

  select teacher_id, deleted_at into v_group_teacher, v_group_deleted from public.tracker_groups where id = v_group;
  if v_group_teacher is distinct from v_bogdan then
    raise exception 'Clasa lui Luca Marinescu nu este la Bogdan - nu modific nimic.';
  end if;
  if v_group_deleted is not null then
    raise exception 'Clasa lui Luca Marinescu e in Urna (stearsa) - restaureaz-o intai, nu modific nimic.';
  end if;

  -- 1. Proprietarul aliniat pe clasa lui Luca (doar randurile ramase pe alt profesor).
  update public.tracker_students set teacher_id = v_bogdan where id = v_student and teacher_id <> v_bogdan;
  update public.tracker_lessons set teacher_id = v_bogdan where group_id = v_group and teacher_id <> v_bogdan;
  update public.tracker_attendance set teacher_id = v_bogdan
    where teacher_id <> v_bogdan
      and lesson_id in (select id from public.tracker_lessons where group_id = v_group);

  -- 2. Clasa vizibila din nou daca are elevi activi.
  perform public.sync_group_archive_status(v_group);

  -- 3. Nivel 3, 0/16. Modulul curent al clasei = acelasi calcul ca currentModuleOf
  --    (src/lib/lessonNumbering.ts): cea mai avansata lectie creata; fara lectii -> cea mai
  --    avansata pozitie manuala (lesson_offset) a elevilor activi.
  select max(curriculum_index) into n from public.tracker_lessons where group_id = v_group;
  if n is null then
    select coalesce(max(lesson_offset), 0) into n from public.tracker_students
      where group_id = v_group and deleted_at is null and status <> 'dropped_out';
  end if;
  v_module := (greatest(n, 1) - 1) / 16 + 1;

  update public.tracker_attendance a set star_count = 0
    from public.tracker_lessons l
    where l.id = a.lesson_id and l.group_id = v_group and a.student_id = v_student
      and (greatest(l.curriculum_index, 1) - 1) / 16 + 1 = v_module
      and a.star_count <> 0;

  update public.tracker_students set progress = 32, legacy_module_stars = 0 where id = v_student;

  raise notice 'Luca Marinescu reparat: clasa %, modulul curent M%.', v_group, v_module;
end $$;

-- Verificare 1: starea lui Luca (asteptat: nivel 3, steluțe_modul_curent 0, clasa nearhivata).
select s.name as elev, s.status, g.group_name as clasa, g.is_archived as clasa_arhivata,
       s.progress, s.progress / 16 + 1 as nivel, s.lesson_offset, s.legacy_module_stars,
       (select coalesce(sum(a.star_count), 0) from public.tracker_attendance a
          join public.tracker_lessons l on l.id = a.lesson_id
          where a.student_id = s.id and l.group_id = s.group_id
            and (greatest(l.curriculum_index, 1) - 1) / 16
              = (greatest((select max(curriculum_index) from public.tracker_lessons where group_id = s.group_id), 1) - 1) / 16
       ) as stelute_modul_curent
from public.tracker_students s
join public.tracker_groups g on g.id = s.group_id
where s.name ilike '%luca%' and s.name ilike '%marinescu%' and s.deleted_at is null;

-- Verificare 2: ultimele lectii ale clasei. Butonul "+" (lectie noua) cere ca la ULTIMA lectie
-- (sedinta cu numarul cel mai mare) fiecare elev activ sa aiba Prezent/Absent/Recuperat.
-- "elevi_fara_status" nevid pe primul rand = profesorul trebuie sa-i bifeze acolo.
select l.session_number as sedinta, l.curriculum_index, l.lesson_date as data_lectie,
       l.is_taught as efectuata, p.full_name as proprietar,
       (select string_agg(s.name, ', ') from public.tracker_students s
          where s.group_id = l.group_id and s.deleted_at is null and s.status <> 'dropped_out'
            and not exists (select 1 from public.tracker_attendance a where a.lesson_id = l.id and a.student_id = s.id)
       ) as elevi_fara_status
from public.tracker_lessons l
left join public.profiles p on p.id = l.teacher_id
where l.group_id = (select group_id from public.tracker_students
                    where name ilike '%luca%' and name ilike '%marinescu%' and deleted_at is null)
order by l.session_number desc
limit 5;
