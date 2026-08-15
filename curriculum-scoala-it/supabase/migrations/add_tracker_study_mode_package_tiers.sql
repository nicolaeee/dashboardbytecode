-- ============================================================================
--  MOD DE STUDIU + PACHETE CU NUMAR FIX DE LECTII
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  study_mode ('individual'/'grup') controleaza ce optiuni de pachet apar in
--  dropdown-ul Tip Abonament din "Editeaza Elev" (vezi STUDY_MODE_SUBSCRIPTION_OPTIONS
--  in src/lib/types.ts): 'lunar_4' e disponibil DOAR pentru 'individual'.
--
--  subscription_type primeste 4 valori noi cu numar fix de lectii (lunar_4,
--  integral_16/32/48) - selectarea uneia din ele in formular seteaza automat
--  total_package_lessons (vezi PACKAGE_TIER_LESSONS). Valorile legacy
--  (individual_lunar..grup_integral, din add_lesson_balance_subscriptions.sql)
--  raman valide in baza de date pentru elevii care le au deja - constrangerea
--  CHECK e doar LARGITA, nu inlocuita.
-- ============================================================================

alter table public.tracker_students
  add column study_mode text check (study_mode in ('individual', 'grup'));

alter table public.tracker_students
  drop constraint if exists tracker_students_subscription_type_check;

alter table public.tracker_students
  add constraint tracker_students_subscription_type_check
  check (subscription_type in (
    'individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral',
    'lunar_4', 'integral_16', 'integral_32', 'integral_48'
  ));
