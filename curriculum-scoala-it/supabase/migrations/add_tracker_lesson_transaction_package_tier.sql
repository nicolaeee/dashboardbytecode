-- ============================================================================
--  PACHET ALES LA FIECARE TRANZACTIE DE LECTII (numarul abonamentului, #1, #2...)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  package_tier retine care pachet cu numar fix (integral_16/32/48, lunar_4) a fost
--  ales la o reinnoire - completat de handleRenewSubscription (panoul de Management
--  Abonament din Fisa Elevului, admin) si de handleEditStudent (selectorul de pachet
--  din formularul Editeaza Elev). Numaratoarea "Abonamentul #N" afisata in Fisa
--  Elevului = cate randuri cu package_tier completat are elevul, in ordine
--  cronologica - vezi ProgressTracker.tsx.
-- ============================================================================

alter table public.tracker_lesson_transactions
  add column package_tier text
    check (package_tier in (
      'individual_lunar', 'individual_integral', 'grup_lunar', 'grup_integral',
      'lunar_4', 'integral_16', 'integral_32', 'integral_48'
    ));

create index on public.tracker_lesson_transactions (student_id, package_tier);
