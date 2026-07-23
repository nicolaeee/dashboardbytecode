# Curriculum · Școala de IT

Platformă internă de curriculum pentru **administratori** și **profesori**.
Next.js 15 (App Router) + Tailwind CSS + Supabase (Postgres, Auth, Realtime, RLS).

Toate datele stau în Supabase, deci nimic nu se pierde la refresh.

---

## 1. Pornire în 5 pași

> Arhiva conține proiectul complet: `package.json`, configurările, `src/app` cu toate rutele
> (login, admin, profesor) și SQL-ul pentru Supabase. Dezarhivezi și rulezi direct.

```bash
npm install
cp .env.local.example .env.local     # completează cheile din Supabase
npm run dev
```

1. **Creează un proiect Supabase** (supabase.com → New project).
2. **Rulează schema**: SQL Editor → lipește tot `supabase/schema.sql` → Run.
   Opțional, rulează apoi `supabase/seed.sql` pentru date demonstrative.
3. **Completează `.env.local`** cu valorile din Project Settings → API:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. **Creează primul cont**: Authentication → Users → Add user (email + parolă, „Auto confirm”).
5. **Fă-l administrator**: SQL Editor →
   `update public.profiles set role = 'admin' where email = 'adresa@scoala.ro';`

Gata: intri pe `/login`, iar de acolo poți crea profesori direct din interfață.

---

## 2. Ierarhia curriculumului

```
Platformă (Delightex, Blocuri de cod, Python, Roblox Studio, Unity)
  └── Curs (Alfabetizare / Primii pași în lumi 3D)
        └── Modul (Modulul 1 / Orientare în spațiu 3D)
              └── Lecție (Lecția 1: Primul meu proiect)
```

Fiecare platformă are o culoare de identitate care se propagă vizual prin tot arborele.

---

## 3. Cum funcționează permisiunile

Trei bariere, nu una:

| Nivel | Unde | Ce face |
|---|---|---|
| Bază de date | RLS + `has_lesson_access()` | Conținutul lecțiilor nu iese din Postgres fără permisiune, indiferent de client |
| Rută | `canAccessLesson()` / `canAccessModule()` în server components | Accesul forțat prin URL afișează mesajul de conținut blocat |
| Interfață | `unlocked` în arbore | Modulele blocate se văd, cu lacăt, dar nu se pot deschide |

- Acces la nivel de **modul** (`module_permissions`) sau la nivel de **lecție individuală** (`lesson_permissions`).
- Scheletul (platforme, cursuri, module, titluri de lecții) este vizibil tuturor, ca profesorul să știe ce există. Titlurile vin din viewul `lesson_index`, care expune doar metadate — nu obiectiv, video sau linkuri de proiect.
- Mesajul afișat la acces refuzat, oriunde apare:
  > Nu ai permisiunea de a accesa acest conținut. Dacă ai nevoie de acces, contactează administratorul.

---

## 4. Ce poate fiecare rol

**Administrator**
- CRUD complet pe platforme, cursuri, module și lecții, cu reordonare prin săgeți.
- Creează conturi de profesor (email + parolă inițială).
- Deblochează/blochează module și lecții în timp real, individual sau în bloc (curs întreg, platformă întreagă).
- Promovează un profesor la administrator, dezactivează sau șterge conturi.

**Profesor**
- Navighează doar prin ce i-a fost deblocat; restul apare cu lacăt.
- Pagina de lecție: obiectiv, video explicativ integrat, butoane *Proiect profesor* / *Proiect copil* (se deschid în tab nou), panou lateral cu poziția în curriculum, observații importante și tema pentru acasă cu link.

Modificările adminului ajung instant la profesori: `RealtimeRefresher` ascultă canalul Supabase Realtime și reîmprospătează pagina.

---

## 5. Structura fișierelor

```
supabase/
  schema.sql               tabele, funcții de securitate, politici RLS, realtime
  seed.sql                 date demonstrative
src/
  middleware.ts            sesiune + redirect pentru rutele private
  lib/
    supabase/client.ts     client browser
    supabase/server.ts     client server (respectă RLS)
    supabase/admin.ts      client service_role (doar server actions)
    auth.ts                getProfile / requireUser / requireAdmin
    queries.ts             arborele, verificările de acces, embed video
    types.ts
  components/
    Shell.tsx, NavLinks.tsx, ui.tsx, AccessDenied.tsx, RealtimeRefresher.tsx
  app/
    login/                 autentificare
    auth-actions.ts        signIn / signOut
    admin/
      actions.ts           server actions: CRUD, profesori, permisiuni
      page.tsx             panou
      curriculum/          editorul de curriculum
      teachers/            lista + acces pe profesor
    (teacher)/
      curriculum/          arborele cu lacăte
      modul/[id]/          listă lecții dintr-un modul
      lectie/[id]/         pagina de lecție
```

---

## 6. Idei pentru pasul următor

- Reordonare prin drag & drop (arhitectura pe `position` e deja pregătită).
- Marcarea lecțiilor predate și note personale ale profesorului.
- Import/export curriculum în CSV pentru mutarea între ani școlari.
