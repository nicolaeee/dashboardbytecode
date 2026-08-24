-- ============================================================================
--  MOD DE STUDIU LA FIECARE TRANZACTIE DE PACHET
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  package_tier (vezi add_tracker_lesson_transaction_package_tier.sql) nu e suficient
--  pentru a reconstitui abonamentul anterior cand adminul sterge din greseala ultima
--  tranzactie: 'integral_16'/'32'/'48' sunt comune ambelor moduri (Individual/Grup),
--  deci nu se poate deduce doar din tier care mod era activ. study_mode completeaza
--  acest gol - scris ALATURI de package_tier, niciodata separat (vezi
--  handleRenewSubscription si handleEditStudent in ProgressTracker.tsx).
-- ============================================================================

alter table public.tracker_lesson_transactions
  add column study_mode text check (study_mode in ('individual', 'grup'));
