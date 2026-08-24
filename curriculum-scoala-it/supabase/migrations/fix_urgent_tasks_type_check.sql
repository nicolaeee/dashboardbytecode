-- ============================================================================
--  FIX: urgent_tasks_type_check nu includea 'SEND_VIRTUAL_COINS'
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--
--  Constrangerea pe coloana `type` din urgent_tasks trebuia extinsa cu
--  'SEND_VIRTUAL_COINS' de add_virtual_coins_task.sql, dar acel pas nu a ajuns
--  sa fie rulat pe baza de date live - de-aici eroarea "new row for relation
--  urgent_tasks violates check constraint urgent_tasks_type_check" la
--  finalizarea unei diplome cu recompensa "Monede virtuale" (vezi
--  finalize_diploma_with_reward, Task 2 - "SEND_VIRTUAL_COINS").
--
--  Idempotent - nu strica nimic daca rulezi de doua ori sau daca constrangerea
--  era deja corecta. Nu atinge alte coloane/date din urgent_tasks.
-- ============================================================================

alter table public.urgent_tasks drop constraint if exists urgent_tasks_type_check;
alter table public.urgent_tasks add constraint urgent_tasks_type_check
  check (type in ('DIPLOMA_GENERATED', 'DIPLOMA_NOT_SENT', 'SEND_VIRTUAL_COINS'));
