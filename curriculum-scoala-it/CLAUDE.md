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
- **Mobil (sub `lg`, 1024px)**: `Shell.tsx` randează antet mobil + bară de navigare jos (3 pagini
  din `PRIMARY_HREFS` + „Mai mult”); sidebar-ul de desktop (lg+) e neschimbat. `BottomSheet.tsx` =
  singura foaie de jos (folosită de `Select.tsx` și „Mai mult”). Paginile „tracker” (Progress,
  Registru, Diplome, Demo) folosesc margini negative aliniate la `<main>` din Shell
  (`-mx-4 -mt-4 ... lg:-mx-10 lg:-my-9`) și `top-[var(--mobile-header-h)]` pentru antetul lipit.
  Tokenuri de mișcare/suprafețe + reguli doar-mobil în `globals.css`. Logo: `Logo.tsx` +
  `public/icons/*` + `src/app/favicon.ico` + `manifest.ts` (fără service worker — intenționat).
  Fiecare rută are `loading.tsx` cu skeleton (`Skeletons.tsx`).

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
- Transfer elev la alt profesor: elevul se mută, istoricul (lecții/prezențe) rămâne la vechea clasă;
  automat se aduce DOAR numărul de lecții efectuate (`lesson_offset`, `carry_student_totals_on_transfer.sql`);
  prezențe, absențe, steluțe în modul — le setează adminul manual, după caz, din Editează Elev.
- **Abandon** (`status = 'dropped_out'`): elevul dispare complet din contul profesorului (Progress,
  Diplome, Abonamente — filtrat la sursă cu `.neq('status', 'dropped_out')` doar pentru non-admin).
  Datele rămân intacte; adminul îl vede peste tot (inclusiv când vizualizează profesorul și în
  Arhivă). Registrul/payslip-ul NU se filtrează — lecțiile deja predate se plătesc în continuare.
  În ProgressTracker (admin) elevul Abandon iese și din clasă (`isInClass` / `getStudentsForGroup`:
  carduri, prezențe, numărători, task-uri urgente, căutare) și apare doar în meniul clasei →
  „🚪 Abandon” (Fișa Elevului + „Reactivează”).

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
- 2026-10-14: Luca Marinescu (la prof. Bogdan Pușcașu) — nu se mai puteau adăuga lecții în clasa lui;
  trebuia adus la Nivel 3 cu 0 steluțe. Fără acces la DB, cauza nu a putut fi confirmată; cauze
  posibile acoperite: lecții/prezențe ale clasei rămase cu `teacher_id` al altui profesor (invizibile
  prin RLS → butonul „+” calculează un `session_number` deja folosit → „Eroare la crearea lecției”)
  sau clasă rămasă `is_archived`. Reparat doar pentru el cu `supabase/repair/fix_luca_marinescu_bogdan.sql`:
  aliniază `teacher_id` pe clasa lui (fără `taught_by` → registrul nu se schimbă), re-sincronizează
  arhivarea, `progress = 32` (Nivel 3), `legacy_module_stars = 0` și `star_count = 0` doar pe lecțiile
  lui din modulul curent al clasei. Prezențele, soldul, poziția M/L și diplomele nu se ating. Dacă
  blocajul persistă, „Verificare 2” din script arată elevii fără status la ultima lecție (popup-ul
  „Prezență incompletă” din `openNewLessonModal`) — aceia trebuie bifați de profesor.

## Problemă deschisă (2026-10-14) — modulul nu avansează după 16 lecții (mai mulți profesori)

**Raportat:** pe lângă cazul Luca Marinescu / Bogdan, și la alți profesori modulul nou nu se
„adaptează”: după 16 lecții efectuate de copil/grupă ar trebui să treacă la modulul (nivelul)
următor, iar steluțele X/16 să pornească iar de la 0. **Doar analizat — niciun cod/SQL schimbat.**

**Ce am verificat în cod (cauza probabilă):** există două „ceasuri” de modul care nu sunt legate:
1. **Eticheta elevului „M{x}/L{y}”** = `lesson_offset` + prezențele/recuperările **lui**
   (`studentLessonCount`) → per elev, avansează corect la fiecare 16 lecții.
2. **Modulul de pe card (X/16) și popup-ul „modul nou”** = `currentModuleOf(groupLessons)` =
   modulul celui mai mare `curriculum_index` din lecțiile **clasei**; popup-ul apare doar când
   o lecție cu `curriculum_index % 16 === 0` devine efectuată (`performSetAttendanceStatus`).
   `curriculum_index` e ancorat **o singură dată**, la prima lecție a clasei
   (`max(lesson_offset)+1`, în `createLesson`), apoi crește doar +1 din lecția efectuată
   anterioară. Dacă adminul schimbă ulterior poziția din „Editează Elev” (`lesson_offset`
   recalculat), dacă elevul a fost adăugat/transferat cu istoric după ce clasa avea deja lecții,
   sau dacă lecțiile vechi au primit `curriculum_index = session_number` la backfill
   (`add_tracker_lesson_curriculum_index.sql`), indexul clasei rămâne în urma etichetei elevului
   → eticheta arată deja M2/M3, dar cardul numără în continuare modulul vechi (nu se resetează
   la 0), iar steluțele manuale (`legacy_stars_module` = modulul etichetei) devin invizibile.
3. Același calcul (modulul clasei) e folosit și la /diplome (`moduleStarsByStudent`, ruta
   `api/diploma-groups`) și în SQL (`finalize_diploma_with_reward`, pe `curriculum_index`).
4. Separat: „Nivel” de pe card = `floor(progress / 16) + 1` (steluțe **cumulative**), nu lecții —
   un copil cu < 16 steluțe pe modul nu urcă de nivel deși a terminat 16 lecții. De clarificat
   cu utilizatorul dacă „nivel” = modul (lecții) sau rămâne pe steluțe.

**Decizie utilizator (2026-10-14):** numărul de lecții efectuate de **fiecare elev** (eticheta
„M{x}/L{y}” = `lesson_offset` + prezențele/recuperările lui) **NU se modifică** de niciun fix sau
script — rămâne exact cât a efectuat. Modulul (și resetarea steluțelor la 0) se derivă din acest
număr per elev, nu invers; nu se rescriu `lesson_offset`, `presence_count`, prezențele sau lecțiile
ca să „potrivească” clasa.

**Transfer elev (decizie utilizator, 2026-10-14):** istoricul (prezențe, recuperări, steluțe pe
lecții) **rămâne la vechiul profesor**, ca până acum — nu se mută niciun rând, registrul (`taught_by`)
nu se schimbă. Automat se transferă **DOAR numărul de lecții efectuate**: în
`supabase/migrations/carry_student_totals_on_transfer.sql` (+ `schema.sql`), la transferul către
ALT profesor, `transfer_student_teacher` adaugă la `lesson_offset` lecțiile efectuate
(prezent/recuperat) vizibile la vechiul profesor, minus cele deja vizibile la noul profesor (elev
întors); audit în `tracker_student_transfers.carried_lessons`. **Restul (prezențe, absențe,
steluțe în modul, `progress`) NU se atinge** — adminul le setează manual, după caz, din Editează
Elev. Transfer în cadrul aceluiași profesor = neschimbat. Transferurile făcute ÎNAINTE de migrare
nu sunt corectate automat.

**Grupe combinate / fix „per copil” — RESPINS de utilizator (2026-10-14):** propunerea ca modulul
și steluțele X/16 să urmeze automat lecțiile fiecărui copil NU se implementează. Situațiile din
grupe combinate (copii cu număr diferit de lecții) le rezolvă adminul manual, după caz.

**Ce urmează să fac (după confirmarea utilizatorului):**
- Script de diagnostic read-only în `supabase/repair/` care listează, pe toți profesorii, clasele
  unde modulul din `max(curriculum_index)` ≠ modulul poziției elevilor (`lesson_offset` +
  prezențe/recuperări), plus clasele cu lecții/prezențe cu alt `teacher_id` decât clasa (cazul
  Bogdan) — ca să vedem câte sunt afectate înainte de orice modificare.
  → **Făcut:** `supabase/repair/diagnose_module_mismatch.sql` (doar SELECT; 3 rezultate: elevi
  afectați cu eticheta lor vs. modulul clasei și steluțele de pe card acum, clase cu lecții/prezențe
  pe alt profesor, rezumat pe profesor).
- ~~Fix în cod: modulul cardului să urmeze poziția elevilor~~ — respins de utilizator (vezi mai sus).
- Script de reparat date (idempotent) pentru clasele găsite de diagnostic, fără să atingă
  prezențele, soldul, registrul sau diplomele deja emise.
