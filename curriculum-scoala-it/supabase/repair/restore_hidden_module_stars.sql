-- ============================================================================
--  Readuce pe Cardul Elevului (contorul X/16) steluțele "disparute" dupa trecerea la steluțe
--  per modul (align_diploma_stars_per_module.sql + add_tracker_legacy_module_stars.sql).
--  Ruleaza o singura data in Supabase -> SQL Editor (DUPA add_tracker_legacy_module_stars.sql).
--
--  Cauza: contorul X/16 numara doar temele bifate pe lectiile clasei din modulul curent +
--  legacy_module_stars. Steluțele introduse manual ("Steluțe colectate" din Editeaza Elev)
--  stau doar in `progress` (cumulativ), iar backfill-ul din add_tracker_legacy_module_stars.sql
--  le-a copiat in legacy_module_stars DOAR pentru elevii cu progress 1..16 si FARA nicio tema
--  bifata. Au ramas pe dinafara (aparand cu 0/16 sau mai putin decat aveau):
--    - copiii cu steluțe manuale + cateva teme bifate in Tracker (ex. 10 manuale + 2 bifate
--      aratau 12/16 inainte, apoi doar 2/16);
--    - copiii cu progress > 16 (istoric pe mai multe module) - inainte cardul arata
--      progress % 16 (16 la multiplu exact), acum 0/16.
--
--  Reparatie: steluțe "ascunse" = progress - temele bifate pe lectiile clasei curente (adica
--  exact ce cardul nu poate vedea). Le punem in legacy_module_stars ca steluțe ale modulului
--  pozitiei manuale (lesson_offset) - aceeasi regula ca legacyStarsInModule:
--    - <= 16 (sau elev in M1)  -> toate, plafonat la 16;
--    - > 16 in M2+             -> doar partea din modulul curent: % 16 (16 la multiplu exact),
--                                 adica exact ce arata cardul inainte de schimbare.
--  Se ating DOAR elevii cu legacy_module_stars = 0 (nu suprascriem ce a completat deja
--  cineva manual din Editeaza Elev sau ce a pus backfill-ul). NU se modifica `progress`,
--  prezentele, temele bifate sau diplomele deja trimise.
--  Daca modulul clasei a trecut deja de modulul pozitiei manuale, steluțele raman salvate dar
--  NU apar pe card - e resetarea la 0 dorita la schimbarea modulului.
--
--  Rezultatul afiseaza fiecare elev modificat cu "card_inainte" -> "card_dupa" (contorul X/16).
--  Coloana "transferat" = da -> elevul a fost mutat de la alt profesor; temele lui din vechea
--  clasa intra si ele in steluțele ascunse - verifica-l din Editeaza Elev
--  ("Steluțe în modulul M{x}") daca numarul nu pare corect.
-- ============================================================================
with modul_clasa as (
  -- Modulul curent al clasei (currentModuleOf): modulul celei mai avansate lectii create;
  -- fara lectii, cea mai avansata pozitie manuala a elevilor.
  select g.id as group_id,
         (greatest(coalesce(
            (select max(l.curriculum_index) from public.tracker_lessons l where l.group_id = g.id),
            (select max(s2.lesson_offset) from public.tracker_students s2 where s2.group_id = g.id and s2.deleted_at is null),
            0), 1) - 1) / 16 + 1 as modul
  from public.tracker_groups g
),
calcul as (
  select s.id, s.name, s.group_id, s.progress, s.lesson_offset,
         (greatest(s.lesson_offset, 1) - 1) / 16 + 1 as modul_manual,
         mc.modul as modul_clasa,
         coalesce((select sum(a.star_count) from public.tracker_attendance a
                   join public.tracker_lessons l on l.id = a.lesson_id
                   where a.student_id = s.id and l.group_id = s.group_id), 0)::int as bifate_clasa,
         coalesce((select sum(a.star_count) from public.tracker_attendance a
                   join public.tracker_lessons l on l.id = a.lesson_id
                   where a.student_id = s.id and l.group_id = s.group_id
                     and (greatest(l.curriculum_index, 1) - 1) / 16 + 1 = mc.modul), 0)::int as bifate_modul_curent,
         exists (select 1 from public.tracker_student_transfers t where t.student_id = s.id) as transferat
  from public.tracker_students s
  join modul_clasa mc on mc.group_id = s.group_id
  where s.legacy_module_stars = 0
),
tinta as (
  select c.*, c.progress - c.bifate_clasa as ascunse,
         case
           when c.modul_manual = 1 or c.progress - c.bifate_clasa <= 16 then least(16, c.progress - c.bifate_clasa)
           when (c.progress - c.bifate_clasa) % 16 = 0 then 16
           else (c.progress - c.bifate_clasa) % 16
         end as legacy_nou
  from calcul c
  where c.progress - c.bifate_clasa > 0
),
actualizati as (
  update public.tracker_students s
  set legacy_module_stars = t.legacy_nou
  from tinta t
  where s.id = t.id and s.legacy_module_stars = 0 and t.legacy_nou > 0
  returning s.id
)
select coalesce(nullif(trim(p.full_name), ''), p.email) as profesor,
       g.group_name as clasa,
       t.name as elev,
       t.progress as stelute_total,
       t.ascunse as stelute_ascunse,
       'M' || t.modul_manual as modul_pozitie_manuala,
       'M' || t.modul_clasa as modul_clasa,
       least(16, t.bifate_modul_curent) || '/16' as card_inainte,
       least(16, t.bifate_modul_curent + case when t.modul_manual = t.modul_clasa then t.legacy_nou else 0 end) || '/16' as card_dupa,
       case when t.transferat then 'da' else '' end as transferat
from tinta t
join actualizati a on a.id = t.id
join public.tracker_groups g on g.id = t.group_id
left join public.profiles p on p.id = g.teacher_id
order by profesor, clasa, elev;
