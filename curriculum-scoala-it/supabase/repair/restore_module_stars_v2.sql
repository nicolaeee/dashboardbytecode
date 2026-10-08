-- ============================================================================
--  Readuce pe Cardul Elevului (contorul X/16) steluțele colectate - varianta 2.
--  Ruleaza o singura data in Supabase -> SQL Editor, DUPA
--  supabase/migrations/add_tracker_legacy_stars_module.sql.
--
--  De ce n-a mers restore_hidden_module_stars.sql: punea steluțele in legacy_module_stars, dar
--  cardul le numara doar daca modulul pozitiei de la intrare (lesson_offset) = modulul curent
--  al clasei. La copiii cu lectii deja facute in Tracker (ex. Horia Simbotin, Dima Androne
--  Filip Ioan) modulul de la intrare e mai vechi -> steluțele erau salvate, dar invizibile.
--  Acum ele primesc explicit modulul curent al clasei (legacy_stars_module).
--
--  Regula (doar elevi nesterși):
--    - tinta = ce arata cardul INAINTE de trecerea la steluțe per modul (5 oct. 2026):
--      progress % 16 (16 la multiplu exact);
--    - se aplica DOAR daca modulul curent al clasei a inceput inainte de 5 oct. (sau clasa nu
--      are lectii in el): daca modulul a inceput dupa, resetarea la 0 a fost cea dorita;
--    - legacy = tinta - temele deja bifate in modulul curent (cardul le aduna pe amandoua);
--    - se modifica DOAR daca asa cardul ar arata MAI MULT decat acum (nu scadem nimanui).
--  Pentru Horia Simbotin (4) si Dima Androne Filip Ioan (15) se pune explicit valoarea ceruta.
--  NU se modifica `progress`, prezentele, temele bifate sau diplomele deja trimise.
--  Rezultatul final: toti elevii cu steluțe istorice in modulul curent + cei doi copii, cu
--  contorul X/16 asa cum il vede acum Progress Tracker.
-- ============================================================================

create or replace temporary view stare_stelute as
with modul_clasa as (
  -- Modulul curent al clasei (currentModuleOf): modulul celei mai avansate lectii create;
  -- fara lectii, cea mai avansata pozitie manuala a elevilor.
  select g.id as group_id,
         (greatest(coalesce(
            (select max(l.curriculum_index) from public.tracker_lessons l where l.group_id = g.id),
            (select max(s2.lesson_offset) from public.tracker_students s2 where s2.group_id = g.id and s2.deleted_at is null),
            0), 1) - 1) / 16 + 1 as modul
  from public.tracker_groups g
)
select s.id, s.name, s.group_id, s.teacher_id, s.progress,
       s.legacy_module_stars, s.legacy_stars_module,
       mc.modul as modul_clasa,
       -- data primei lectii a modulului curent (null = clasa n-are inca lectii in el)
       (select min(l.lesson_date) from public.tracker_lessons l
         where l.group_id = s.group_id and (greatest(l.curriculum_index, 1) - 1) / 16 + 1 = mc.modul) as inceput_modul,
       coalesce((select sum(a.star_count) from public.tracker_attendance a
                 join public.tracker_lessons l on l.id = a.lesson_id
                 where a.student_id = s.id and l.group_id = s.group_id
                   and (greatest(l.curriculum_index, 1) - 1) / 16 + 1 = mc.modul), 0)::int as bifate_modul,
       -- steluțele istorice vizibile ACUM in modulul curent (legacyStarsInModule)
       case when s.legacy_module_stars > 0
             and coalesce(s.legacy_stars_module, (greatest(s.lesson_offset, 1) - 1) / 16 + 1) = mc.modul
            then s.legacy_module_stars else 0 end as legacy_vizibil,
       case when s.progress > 0 and s.progress % 16 = 0 then 16 else s.progress % 16 end as card_vechi
from public.tracker_students s
join modul_clasa mc on mc.group_id = s.group_id
where s.deleted_at is null;

-- 1) Regula generala.
update public.tracker_students s
set legacy_module_stars = least(16, greatest(0, st.card_vechi - st.bifate_modul)),
    legacy_stars_module = st.modul_clasa
from stare_stelute st
where s.id = st.id
  and (st.inceput_modul is null or st.inceput_modul < date '2026-10-05')
  and least(16, st.card_vechi) > least(16, st.bifate_modul + st.legacy_vizibil);

-- 2) Cei doi copii raportati - valoarea ceruta explicit pe card (indiferent de regula de mai sus).
do $$
declare
  v record;
  v_count int;
begin
  for v in
    select * from (values
      ('horia', 'simbotin', 4),
      ('dima', 'androne', 15)
    ) as t(n1, n2, tinta)
  loop
    select count(*) into v_count from stare_stelute
      where translate(lower(name), 'șşțţăâî', 'ssttaai') like '%' || v.n1 || '%'
        and translate(lower(name), 'șşțţăâî', 'ssttaai') like '%' || v.n2 || '%';
    if v_count <> 1 then
      raise notice 'Pentru "% %" am gasit % elevi activi - nu modific nimic, completeaza din Editeaza Elev.', v.n1, v.n2, v_count;
      continue;
    end if;
    update public.tracker_students s
    set legacy_module_stars = least(16, greatest(0, v.tinta - st.bifate_modul)),
        legacy_stars_module = st.modul_clasa
    from stare_stelute st
    where s.id = st.id
      and translate(lower(st.name), 'șşțţăâî', 'ssttaai') like '%' || v.n1 || '%'
      and translate(lower(st.name), 'șşțţăâî', 'ssttaai') like '%' || v.n2 || '%';
  end loop;
end $$;

-- 3) Raport: contorul X/16 asa cum il calculeaza acum Progress Tracker.
select coalesce(nullif(trim(p.full_name), ''), p.email) as profesor,
       g.group_name as clasa,
       st.name as elev,
       st.progress as stelute_total,
       'M' || st.modul_clasa as modul_clasa,
       st.bifate_modul as teme_bifate_in_modul,
       st.legacy_vizibil as stelute_istorice,
       least(16, st.bifate_modul + st.legacy_vizibil) || '/16' as card
from stare_stelute st
join public.tracker_groups g on g.id = st.group_id
left join public.profiles p on p.id = g.teacher_id
where st.legacy_vizibil > 0
   or translate(lower(st.name), 'șşțţăâî', 'ssttaai') like '%simbotin%'
   or translate(lower(st.name), 'șşțţăâî', 'ssttaai') like '%androne%'
order by profesor, clasa, elev;
