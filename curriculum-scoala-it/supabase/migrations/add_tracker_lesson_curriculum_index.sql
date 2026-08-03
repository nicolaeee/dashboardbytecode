-- Pozitia REALA in materie (M{x}/L{y}) a unei lectii, separata de session_number.
--
-- session_number ramane un contor STRICT crescator si unic per grupa (constraint deja existent
-- - vezi schema.sql) - reprezinta a cata sedinta FIZICA e aceasta, in ordine cronologica, si
-- continua sa alimenteze sortarea/dropdown-ul de lectii din Progress Tracker si Payslip-ul din
-- /registru (fiecare sedinta tinuta conteaza acolo, indiferent de prezenta).
--
-- curriculum_index e ce se afiseaza efectiv ca "M{x}/L{y}" in Progress Tracker - ramane
-- INGHETAT (identic cu al lectiei anterioare) daca acea lectie anterioara a fost 100% absenta
-- (nimeni nu a participat, deci nu s-a predat nimic nou), altfel avanseaza cu 1 la fiecare
-- lectie noua, exact ca session_number inainte de aceasta migrare. Calculat o singura data,
-- la creare (vezi createLesson in ProgressTracker.tsx) - nu se mai schimba dupa aceea.
--
-- Backfill: pentru toate lectiile existente (create inainte de aceasta migrare), curriculum_index
-- pornea mereu sincronizat cu session_number (nu exista inca logica de inghetare) - deci
-- session_number e valoarea corecta de backfill.
alter table public.tracker_lessons add column curriculum_index int;
update public.tracker_lessons set curriculum_index = session_number where curriculum_index is null;
alter table public.tracker_lessons alter column curriculum_index set not null;
