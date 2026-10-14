-- ============================================================================
--  DIAGNOSTIC (DOAR CITIRE): elevii la care modulul de pe card NU urmeaza lectiile efectuate
--  de el. Ruleaza in Supabase -> SQL Editor. NU modifica nimic (doar SELECT-uri) - se poate
--  rula de oricate ori.
--
--  Context (vezi CLAUDE.md -> "Problema deschisa (2026-10-14)"):
--    - Eticheta "M{x}/L{y}" a elevului = lesson_offset + prezentele/recuperarile LUI -> asta e
--      numarul real de lectii efectuate si NU se modifica (decizia utilizatorului).
--    - Contorul X/16 de pe card numara steluțele din modulul CLASEI = modulul celui mai mare
--      curriculum_index al lectiilor clasei (currentModuleOf in src/lib/lessonNumbering.ts).
--      Cand cele doua difera, copilul a trecut de 16 lectii dar cardul nu porneste de la 0
--      (sau ramane intr-un modul vechi, iar steluțele manuale nu se vad).
--
--  Rezultate (cate un tabel per SELECT - in SQL Editor apare de obicei doar ULTIMUL; ruleaza-le
--  pe rand, selectand fiecare bloc, daca vrei sa le vezi pe toate):
--    1. Elevii afectati: pozitia lor reala vs. modulul clasei + ce arata cardul acum vs. ce ar
--       arata daca ar urma modulul elevului.
--    2. Clase cu lectii/prezente ramase pe alt profesor decat clasa (cazul Bogdan - butonul "+"
--       da "Eroare la crearea lectiei").
--    3. Rezumat pe profesor.
-- ============================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Elevii la care modulul elevului (lectiile LUI) <> modulul clasei (cel folosit de card)
-- ---------------------------------------------------------------------------------------------
with students as (
  select s.id, s.name, s.teacher_id, s.group_id, s.lesson_offset, s.progress,
         s.legacy_module_stars, s.legacy_stars_module
  from public.tracker_students s
  join public.tracker_groups g on g.id = s.group_id
  where s.deleted_at is null and s.status <> 'dropped_out' and g.deleted_at is null
),
-- Pozitia reala = lesson_offset + prezente/recuperari (acelasi calcul ca studentLessonCount)
positions as (
  select st.*,
         st.lesson_offset + coalesce((
           select count(*) from public.tracker_attendance a
           where a.student_id = st.id and a.status in ('present', 'made_up')
         ), 0) as lessons_done
  from students st
),
-- Modulul clasei = modulul max(curriculum_index); fara lectii -> max(lesson_offset) al elevilor
group_modules as (
  select g.id as group_id,
         ((greatest(1, coalesce(
            (select max(l.curriculum_index) from public.tracker_lessons l where l.group_id = g.id),
            (select max(p.lesson_offset) from positions p where p.group_id = g.id),
            0)) - 1) / 16) + 1 as class_module
  from public.tracker_groups g
  where g.deleted_at is null
),
calc as (
  select p.*,
         ((greatest(1, p.lessons_done) - 1) / 16) + 1 as student_module,
         gm.class_module,
         coalesce(p.legacy_stars_module, ((greatest(1, p.lesson_offset) - 1) / 16) + 1) as legacy_module
  from positions p
  join group_modules gm on gm.group_id = p.group_id
)
select
  pr.full_name                                                   as profesor,
  g.group_name                                                   as clasa,
  c.name                                                         as elev,
  c.lessons_done                                                 as lectii_efectuate,
  'M' || c.student_module || ' / L' || (((greatest(1, c.lessons_done) - 1) % 16) + 1) as eticheta_elev,
  c.class_module                                                 as modul_clasa_card,
  -- Ce arata cardul ACUM (steluțe pe lectiile clasei din modulul clasei + legacy daca e acolo)
  least(16, coalesce((
    select sum(a.star_count) from public.tracker_attendance a
    join public.tracker_lessons l on l.id = a.lesson_id
    where a.student_id = c.id and l.group_id = c.group_id
      and ((greatest(1, l.curriculum_index) - 1) / 16) + 1 = c.class_module
  ), 0) + case when c.legacy_module = c.class_module then c.legacy_module_stars else 0 end) as stelute_card_acum,
  c.legacy_module_stars                                          as stelute_manuale,
  c.legacy_module                                                as modul_stelute_manuale,
  c.progress                                                     as stelute_cumulative
from calc c
join public.tracker_groups g on g.id = c.group_id
join public.profiles pr on pr.id = g.teacher_id
where c.student_module <> c.class_module
order by pr.full_name, g.group_name, c.name;

-- ---------------------------------------------------------------------------------------------
-- 2. Clase cu lectii / prezente care au alt teacher_id decat clasa (invizibile prin RLS)
-- ---------------------------------------------------------------------------------------------
select pr.full_name as profesor_clasa, g.group_name as clasa,
       count(distinct l.id) filter (where l.teacher_id <> g.teacher_id) as lectii_pe_alt_profesor,
       count(distinct a.id) filter (where a.teacher_id <> g.teacher_id) as prezente_pe_alt_profesor
from public.tracker_groups g
join public.profiles pr on pr.id = g.teacher_id
left join public.tracker_lessons l on l.group_id = g.id
left join public.tracker_attendance a on a.lesson_id = l.id
where g.deleted_at is null
group by pr.full_name, g.group_name
having count(distinct l.id) filter (where l.teacher_id <> g.teacher_id) > 0
    or count(distinct a.id) filter (where a.teacher_id <> g.teacher_id) > 0
order by pr.full_name, g.group_name;

-- ---------------------------------------------------------------------------------------------
-- 3. Rezumat: cati elevi afectati (din 1) are fiecare profesor
-- ---------------------------------------------------------------------------------------------
with positions as (
  select s.id, s.group_id, s.lesson_offset,
         s.lesson_offset + coalesce((select count(*) from public.tracker_attendance a
           where a.student_id = s.id and a.status in ('present', 'made_up')), 0) as lessons_done
  from public.tracker_students s
  join public.tracker_groups g on g.id = s.group_id
  where s.deleted_at is null and s.status <> 'dropped_out' and g.deleted_at is null
),
group_modules as (
  select g.id as group_id, g.teacher_id,
         ((greatest(1, coalesce(
            (select max(l.curriculum_index) from public.tracker_lessons l where l.group_id = g.id),
            (select max(p.lesson_offset) from positions p where p.group_id = g.id),
            0)) - 1) / 16) + 1 as class_module
  from public.tracker_groups g
  where g.deleted_at is null
)
select pr.full_name as profesor,
       count(*) filter (where ((greatest(1, p.lessons_done) - 1) / 16) + 1 > gm.class_module) as elevi_inaintea_clasei,
       count(*) filter (where ((greatest(1, p.lessons_done) - 1) / 16) + 1 < gm.class_module) as elevi_in_urma_clasei,
       count(*) as elevi_activi
from positions p
join group_modules gm on gm.group_id = p.group_id
join public.profiles pr on pr.id = gm.teacher_id
group by pr.full_name
-- Postgres nu accepta aliasurile din SELECT intr-o expresie din ORDER BY - se repeta conditia.
order by count(*) filter (where ((greatest(1, p.lessons_done) - 1) / 16) + 1 <> gm.class_module) desc, pr.full_name;
