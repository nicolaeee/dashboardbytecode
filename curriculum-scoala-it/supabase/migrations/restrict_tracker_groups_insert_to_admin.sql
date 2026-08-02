-- ============================================================================
--  CREAREA CLASELOR - REZERVATA EXCLUSIV ADMINULUI
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  De ce e necesara aceasta migrare (nu doar ascunderea butonului din UI):
--  Politica actuala "profesorul isi gestioneaza grupele" e "for all" (SELECT+INSERT+UPDATE+
--  DELETE la un loc) - un profesor ar putea in continuare crea o clasa noua printr-un request
--  direct catre Supabase (ex. din consola browser-ului), ocolind complet butonul ascuns din UI
--  si server action-ul createClass (admin/actions.ts). Aceasta migrare inlocuieste politica
--  unica cu 3 politici separate pentru profesor - SELECT/UPDATE/DELETE raman neschimbate
--  (profesorul isi vede/edita/sterge in continuare propriile clase, inclusiv din Urna), dar
--  politica de INSERT dispare complet pentru rolul de profesor. Politica adminului
--  ("adminul gestioneaza toate grupele", neschimbata) ramane singura care permite INSERT,
--  deci doar adminul mai poate crea clase noi, la orice nivel (UI, server action sau request
--  direct catre Supabase).
--
--  100% non-distructiv: nu atinge niciun rand de date, doar regulile de acces.
-- ============================================================================

drop policy if exists "profesorul isi gestioneaza grupele" on public.tracker_groups;

create policy "profesorul vede propriile grupe" on public.tracker_groups
  for select to authenticated using (teacher_id = auth.uid());

create policy "profesorul edita propriile grupe" on public.tracker_groups
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "profesorul sterge propriile grupe" on public.tracker_groups
  for delete to authenticated using (teacher_id = auth.uid());
