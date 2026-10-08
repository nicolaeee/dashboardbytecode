# CLAUDE.md — Curriculum · Școala de IT

Platformă internă pentru o școală de programare pentru copii: **adminii** gestionează curriculumul,
profesorii, abonamentele și task-urile; **profesorii** își țin clasele în Progress Tracker
(prezențe, steluțe/teme, module, diplome). Interfața și comentariile din cod sunt în **română**
(de obicei fără diacritice în comentarii, cu diacritice în UI). Utilizatorul comunică în română.

## Stack & comenzi

- Next.js 15 (App Router, server components + server actions), React 19, TypeScript, Tailwind 3,
  `lucide-react` pentru iconițe.
- Supabase: Postgres + Auth + Realtime + RLS + funcții `security definer` + `pg_cron`.
- `npm run dev` · `npm run build` · `npm run lint` · `npm test` (vitest, doar `src/**/*.test.ts`,
  mediu `node`, fără DOM/React — testăm doar logica pură din `src/lib` și câteva rute API cu
  `src/test/supabaseFake.ts`).
- Typecheck: `npx tsc --noEmit -p .`
- Env (`.env.local`, nu e în repo): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. Claude NU are acces la baza de date live — datele concrete (ex. un
  elev anume la un profesor anume) nu pot fi verificate de aici; se raționează din cod.
- Git: repo-ul e directorul părinte (`curriculum-scoala-it/`), proiectul e în subfolderul
  `curriculum-scoala-it/`. Mesajele de commit ale utilizatorului sunt de tip „ff”.

## Baza de date — reguli de lucru

- `supabase/schema.sql` = schema completă pentru o instalare de la zero.
- `supabase/migrations/*.sql` = fișiere rulate **manual, o singură dată**, de utilizator în
  Supabase → SQL Editor (nu există CLI de migrare / ordine automată). Orice schimbare de schemă:
  1. migrare nouă idempotentă (`if not exists`, `create or replace`) cu antet explicativ în română;
  2. aceeași schimbare aplicată și în `schema.sql`;
  3. spune-i utilizatorului să ruleze migrarea **înainte** de a publica codul (pagina `/progress`
     selectează coloane explicit pentru profesori — o coloană lipsă strică pagina).
- Când rescrii o funcție SQL (ex. `finalize_diploma_with_reward`), pornește de la **cea mai recentă**
  definiție (cea din migrarea cea mai nouă / `schema.sql`) și păstrează semnătura + `grant`.
- `supabase/repair/` = scripturi one-off de reparat date.
- RLS peste tot: profesorul vede doar rândurile cu `teacher_id = auth.uid()`; adminul (`is_admin()`)
  vede tot. Coloanele GDPR (`parent_phones`, `parent_emails`) sunt doar pentru admin — profesorul
  nici nu le primește în payload (`progress/page.tsx`).

### Tabele principale

- Curriculum: `platforms → courses → modules → lessons`, permisiuni `module_permissions` /
  `lesson_permissions`, view `lesson_index` (doar metadate). `profiles` (role `admin`/`teacher`,
  `is_active`, nivel profesor, telefon, link calendar recuperări).
- Tracker: `tracker_groups` (clase; `course`, `reward_type`, zi/oră, `meet_link`, arhivare),
  `tracker_students`, `tracker_lessons` (ședințe; `session_number`, `curriculum_index`,
  `is_taught`, `homework_note`), `tracker_attendance` (status `present`/`absent`/`made_up`,
  `star_count` 0–3, date recuperare), `tracker_student_transfers`, `tracker_lesson_transactions`
  (sold pachete).
- `urgent_tasks` (tipuri `DIPLOMA_GENERATED`, `DIPLOMA_NOT_SENT`, `SEND_VIRTUAL_COINS`,
  `SUBSCRIPTION_FINISHED`), `feature_access` (module opționale: `subscriptions`,
  `dropout_analytics`), `feedback_templates`.

## Structura aplicației

- `src/middleware.ts` — sesiune Supabase + redirect la `/login` pentru rute private.
- `src/lib/auth.ts` — `getProfile` (memoizat), `requireUser`, `requireAdmin`.
- `src/lib/supabase/{client,server,admin}.ts` — browser / server cu RLS / service_role (doar server).
- `src/app/admin/` — Curriculum, Profesori (+ permisiuni și feature access pe profesor),
  Task-uri Urgente, Șabloane Feedback, Arhivă; `admin/actions.ts` = server actions (CRUD, conturi,
  transfer clasă/elev, permisiuni).
- `src/app/(teacher)/` — `curriculum`, `modul/[id]`, `lectie/[id]`, **`progress`**
  (`ProgressTracker.tsx`, ~4.5k linii, componenta centrală), `registru` (payslip profesor),
  `diplome`, `recompense`, `roadmap`, `abonamente`, `analytics` (rata de abandon), `demo`
  (ghid interactiv cu date fictive — `DemoClient.tsx` are un `baseStudent` care trebuie ținut în
  sync cu `TrackerStudent`).
- `src/app/api/*` — rute pentru alerte (admin, link conectare, recuperări, sold lecții, praguri
  diplomă), `diploma-groups` (elevi + steluțe pentru /diplome, admin poate cere alt profesor),
  `my-profile`, `makeup-calendar-link`. `src/lib/apiSecurity.ts` = rate limiting.
- `public/diplome/<Curs>/Diploma_modulul<N>_<suffix>.html` — șabloane diplome (module 1–4);
  `src/lib/diplomas.ts` construiește URL-urile. `src/Diplome_feedback/` = variante vechi.
- `RealtimeRefresher` — reîmprospătează paginile la schimbări din Supabase Realtime.

## Logica de business din Progress Tracker (important)

- **Module/lecții**: 16 lecții = 1 modul. Poziția elevului = `lesson_offset` (istoric manual,
  setat din „Editează Elev”) + prezențe/recuperări din Tracker → afișat „M{x} / L{y}”
  (`src/lib/lessonNumbering.ts`). Lecțiile unei clase primesc `curriculum_index`, pornind de la
  max(`lesson_offset`)+1 al elevilor.
- **Modulul curent al clasei** = modulul celei mai avansate lecții create (`currentModuleOf`);
  fără lecții, cade pe cea mai avansată poziție manuală a elevilor.
- **Steluțe** (teme): per lecție, `tracker_attendance.star_count` 0–3 (click ciclic), doar dacă
  elevul e `present`/`made_up`; „absent” le anulează.
  - `tracker_students.progress` = total **cumulativ** (Nivel, insigne, clasament) — modificat de
    `applyStarDelta` la fiecare steluță și suprascris din câmpul „Steluțe colectate” din Editează Elev.
  - Contorul **X/16** de pe Cardul Elevului și steluțele de pe **diplomă** sunt **per modul**
    (fiecare modul pornește de la 0): temele bifate pe lecțiile modulului (`moduleStarsFor`)
    **+** `legacy_module_stars` (steluțe istorice introduse manual) dacă modulul lor cade în acel
    modul (`legacyStarsInModule`). Modulul lor = `legacy_stars_module` (salvat explicit din
    Editează Elev = modulul poziției afișate în etichetă); `NULL` (elevi vechi) → modulul lui
    `lesson_offset`. Același calcul există în SQL în `finalize_diploma_with_reward` — ține-le
    sincronizate.
  - Popup-ul „16 steluțe” apare când elevul trece pragul 16 în modulul lecției.
- **Diplome**: praguri la fiecare 16 prezențe (`pending_diploma_milestone`, trigger-e SQL), task
  urgent pentru admin; profesorul generează diploma din /diplome (sau mod „Manual”), funcția
  `finalize_diploma_with_reward` creează task-urile pentru admin (diploma + eventual monede virtuale).
- **Recuperări**: „absent” crește `pending_makeups` (`src/lib/attendanceTransition.ts`), notificări
  către părinte, programare.
- **Payslip/Registru** (`src/lib/registryCalc.ts`): o lecție din curriculum se plătește o singură
  dată (live sau recuperare) — nu folosi `is_taught` pentru plată.
- **Abonamente**: `study_mode` + `subscription_type` (pachete cu număr fix sau `custom`),
  `total_lessons_remaining` scade din prezențe/absențe.
- Transfer elev la alt profesor: elevul se mută, istoricul (lecții/prezențe) rămâne la vechea clasă.
- **Abandon** (`status = 'dropped_out'`): elevul dispare complet din contul profesorului (Progress,
  Diplome, Abonamente — filtrat la sursă cu `.neq('status', 'dropped_out')` doar pentru non-admin).
  Datele rămân intacte; adminul îl vede peste tot (inclusiv când vizualizează profesorul și în
  Arhivă). Registrul/payslip-ul NU se filtrează — lecțiile deja predate se plătesc în continuare.

## Convenții de cod

- Comentariile explică „de ce”, în română, des și detaliat — păstrează stilul.
- Câmpurile numerice din formulare acceptă `''` (input gol) — vezi `numericInputValue`/`numOrZero`;
  valorile istorice sunt plafonate (`MAX_HISTORICAL_COUNT`).
- Update-uri optimiste în ProgressTracker cu rollback la eroare + `showToast`.
- Adaugă teste vitest în `src/lib/*.test.ts` pentru orice logică pură nouă.

## Istoric schimbări notabile

- 2026-10-06: steluțele introduse manual pentru un copil adăugat cu istoric (ex. Fineas Joel
  Ciurdaș, la prof. Cristian Marza) nu apăreau pe contorul X/16, pentru că erau scrise doar în
  `progress`, iar contorul numără doar temele bifate pe lecții. Adăugat `legacy_module_stars`
  (migrarea `add_tracker_legacy_module_stars.sql`, cu backfill pentru elevii cu `progress` 1–16 și
  fără nicio temă bifată) + câmp „Steluțe în modulul M{x}” în Editează Elev.
- 2026-10-08: după trecerea la steluțe per modul, unii copii apăreau cu 0/16 (sau mai puțin decât
  aveau): backfill-ul de mai sus sărise elevii cu steluțe manuale **și** câteva teme bifate, și pe
  cei cu `progress` > 16. Reparat cu `supabase/repair/restore_hidden_module_stars.sql`: steluțele
  „ascunse” (`progress` − temele bifate pe lecțiile clasei curente) intră în `legacy_module_stars`
  (≤16 sau M1 → toate; >16 în M2+ → `% 16`, 16 la multiplu exact — ce arăta cardul înainte), doar
  unde `legacy_module_stars = 0`. Limitare cunoscută: la elevii transferați, temele din vechea clasă
  nu se văd pe card (RLS + `group_id` în calcul) — se corectează manual din Editează Elev.
- 2026-10-08: Chiru Alexandru a fost șters (urnă, `deleted_at`) în loc de „Abandon”; restaurat +
  `status = 'dropped_out'` cu `supabase/repair/restore_chiru_alexandru_as_dropout.sql`. Dialogul
  „Ștergi elevul?” are acum o atenționare să se folosească Abandon pentru copiii plecați.
  „Abandon” e doar pentru admin, în Fișa Elevului; ștergerea e soft (urnă) până la 🗑️ din urnă.
- 2026-10-08 (2): `restore_hidden_module_stars.sql` nu a ajutat (ex. Horia Simbotin trebuia 4/16,
  Dima Androne Filip Ioan 15/16): stelele erau atribuite modulului lui `lesson_offset` (poziția
  de la intrare), dar la copiii cu lecții în Tracker acela e un modul mai vechi decât cel curent →
  salvate, dar invizibile. Același bug era și în Editează Elev (eticheta „M{x}” = poziția curentă,
  salvarea = modulul lui `lesson_offset`). Adăugat `legacy_stars_module` (migrarea
  `add_tracker_legacy_stars_module.sql`) + reparat datele cu
  `supabase/repair/restore_module_stars_v2.sql` (țintă = ce arăta cardul înainte de 5 oct.,
  `progress % 16`, doar dacă modulul curent al clasei a început înainte de 5 oct.; Horia/Dima explicit).
