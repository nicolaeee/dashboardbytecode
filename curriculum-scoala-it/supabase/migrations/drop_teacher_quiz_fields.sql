-- ============================================================================
--  ROLLBACK: QUIZ DE ONBOARDING & TESTARE (functionalitate abandonata)
--  OPTIONAL - ruleaza acest fisier DOAR daca ai rulat in trecut
--  add_teacher_quiz_fields.sql (adica cele doua coloane chiar exista in baza ta).
--  Daca nu l-ai rulat niciodata, NU e nevoie sa rulezi nici acest rollback.
--
--  Codul aplicatiei (pagina /testare, comutatorul din Panoul de Profesori, rutele
--  /api/quiz/*) a fost sters complet - coloanele de mai jos au ramas orfane, fara
--  niciun cod care sa le mai citeasca/scrie. Le poti sterge in siguranta.
--
--  ATENTIE: DROP COLUMN e ireversibil (pierzi valorile stocate acolo, doar
--  true/false per profesor, fara alt continut) - de-asta e un fisier separat, pe
--  care il rulezi tu explicit, nu ceva aplicat automat.
-- ============================================================================

alter table public.profiles
  drop column if exists has_quiz_access,
  drop column if exists has_completed_quiz;
