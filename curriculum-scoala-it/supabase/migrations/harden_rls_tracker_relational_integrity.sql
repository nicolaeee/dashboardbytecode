-- ============================================================================
--  AUDIT SECURITATE #1 - INTARIRE RLS (100% NON-DISTRUCTIV)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  NU contine DROP/DELETE/TRUNCATE si nu atinge niciun rand existent din date -
--  foloseste exclusiv ALTER POLICY, care doar rescrie REGULA de acces (metadata
--  de securitate), fara sa modifice sau sa stearga vreun tabel/rand/coloana.
--
--  CE REZOLVA:
--  Politicile existente ("profesorul isi gestioneaza elevii/lectiile/prezenta")
--  verifica deja strict teacher_id = auth.uid() pe randul propriu-zis, deci un
--  profesor NU poate citi/edita/sterge direct randurile altui profesor (SELECT-ul
--  era deja etans). Gaura ramasa era pe SCRIERE: un profesor autentificat putea,
--  printr-un request manual (ex. din consola/DevTools) catre REST-ul Supabase,
--  sa introduca/modifice un rand cu teacher_id = el insusi, dar cu o referinta
--  (group_id / lesson_id / student_id) catre o grupa/lectie/elev apartinand ALTUI
--  profesor - RLS-ul actual nu verifica asta. Practic putea "agata" date false de
--  o grupa straina, sau (mai grav, la tracker_attendance) putea bloca profesorul
--  tinta sa isi mai inregistreze prezenta pe acel elev+lectie, din cauza
--  constraint-ului unique(lesson_id, student_id).
--  Fix: WITH CHECK acum verifica in plus ca parintele referit apartine chiar
--  profesorului care scrie randul.
-- ============================================================================

-- tracker_students: group_id trebuie sa apartina unei grupe a aceluiasi profesor.
alter policy "profesorul isi gestioneaza elevii" on public.tracker_students
  to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.tracker_groups g
      where g.id = tracker_students.group_id and g.teacher_id = auth.uid()
    )
  );

-- tracker_lessons: group_id trebuie sa apartina unei grupe a aceluiasi profesor.
alter policy "profesorul isi gestioneaza lectiile" on public.tracker_lessons
  to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.tracker_groups g
      where g.id = tracker_lessons.group_id and g.teacher_id = auth.uid()
    )
  );

-- tracker_attendance: lesson_id si student_id trebuie sa apartina aceluiasi profesor.
alter policy "profesorul isi gestioneaza prezenta" on public.tracker_attendance
  to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.tracker_lessons l
      where l.id = tracker_attendance.lesson_id and l.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.tracker_students s
      where s.id = tracker_attendance.student_id and s.teacher_id = auth.uid()
    )
  );

-- Politica "profesorul isi gestioneaza grupele" (tracker_groups) ramane neschimbata -
-- acolo nu exista o referinta parinte de validat (grupa e varful ierarhiei), deci
-- teacher_id = auth.uid() acopera deja complet cazul.
