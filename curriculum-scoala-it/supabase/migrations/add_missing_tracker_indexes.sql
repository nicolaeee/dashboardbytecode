-- ============================================================================
--  AUDIT PERFORMANTA #4 - INDECSI LIPSA (100% NON-DISTRUCTIV)
--  Ruleaza acest fisier o singura data in Supabase -> SQL Editor.
--  CREATE INDEX IF NOT EXISTS nu atinge datele existente si nu poate esua daca
--  indexul exista deja - doar accelereaza interogarile, fara sa schimbe rezultatul lor.
--
--  CE REZOLVA:
--  tracker_lessons si tracker_attendance aveau deja index pe group_id/lesson_id/
--  student_id, dar NU si pe teacher_id - desi progress/page.tsx si registru/page.tsx
--  filtreaza exact dupa teacher_id la fiecare incarcare de pagina (full table scan
--  fara index, agraveaza cu numarul de profesori/lectii din baza de date).
--  In plus, cel mai frecvent filtru din toata aplicatia e "randurile ACTIVE ale
--  profesorului curent" (teacher_id = ... and deleted_at is null) - un index
--  compus pe (teacher_id, deleted_at) serveste exact acest tipar, mai eficient
--  decat indexul simplu pe teacher_id singur.
-- ============================================================================

create index if not exists tracker_lessons_teacher_id_idx on public.tracker_lessons (teacher_id);
create index if not exists tracker_attendance_teacher_id_idx on public.tracker_attendance (teacher_id);

create index if not exists tracker_groups_teacher_active_idx on public.tracker_groups (teacher_id, deleted_at);
create index if not exists tracker_students_teacher_active_idx on public.tracker_students (teacher_id, deleted_at);

-- Notă: tracker_attendance(lesson_id, student_id) și tracker_lessons(group_id, session_number)
-- au deja index implicit din constrângerile UNIQUE definite în schema.sql - nu mai e nevoie
-- de un index separat pentru ele.
