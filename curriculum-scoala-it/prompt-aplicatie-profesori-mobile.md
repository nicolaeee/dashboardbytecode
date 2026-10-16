# Sarcină: aplicația profesorilor devine „mobile-first, ultrarapidă”, FĂRĂ să se atingă datele

Ești în proiectul aplicației folosite de profesorii ByteCode School (prezențe, teme, progresul copiilor etc.).
Vreau să arate și să meargă pe telefon la nivelul unei aplicații native: navigație faină, totul aliniat, logo și favicon noi, încărcare aproape instantă. Funcțiile rămân exact aceleași.

---

## 0. REGULA NR. 1 — DATELE NU SE ATING (are prioritate față de orice altceva)

Baza de date conține informații reale și sensibile despre copii (prezențe, teme, note, observații). Lucrarea este **exclusiv de interfață și performanță în front-end**.

**Interzis, fără excepție:**
- Migrări, `ALTER` / `CREATE` / `DROP` / `TRUNCATE`, schimbări de schemă, de RLS, de politici, de triggere, de funcții SQL, de indecși, de bucket-uri Storage.
- Comenzi ca `supabase db push`, `db reset`, `prisma migrate`, `prisma db push`, `drizzle-kit push`, rularea de seed-uri, scripturi de import / curățare / „fix data”.
- Orice `INSERT` / `UPDATE` / `DELETE` rulat de tine (din cod, din CLI, din SQL Editor, din teste).
- Modificarea logicii de scriere: server actions, route handlers / API, funcții care salvează prezențe, teme, note — comportamentul lor (ce scriu, unde, când, cu ce validare) rămâne identic. Dacă o componentă de UI cheamă o funcție de salvare, o cheamă la fel, cu aceiași parametri.
- Schimbarea cheilor / numelor de câmpuri, a formatului datelor trimise, a variabilelor de mediu, a autentificării și a rolurilor.
- Ștergerea de fișiere de date, exporturi, backup-uri.

**Permis:**
- Componente, layout, CSS, iconițe, logo, favicon, manifest PWA, skeleton-uri, `loading.tsx`, încărcare dinamică a componentelor grele, cache de navigare în browser.
- Citiri: poți **restrânge** coloanele citite pentru o listă doar dacă dovedești că UI-ul nu folosește coloanele scoase; poți paraleliza citiri independente (`Promise.all`). Nimic mai mult pe partea de date. Dacă nu ești 100% sigur, NU atinge interogarea.

**Când testezi:** nu trimite formulare, nu bifa prezențe, nu salva teme pe date reale. Testează navigația, afișarea, deschiderea / închiderea dialogurilor, apoi „Anulează”. Dacă o verificare cere o scriere, oprește-te și întreabă-mă (eventual pe o bază de test separată).

Dacă vreun pas din planul de mai jos ar cere o schimbare de date / schemă, **nu-l face**: scrie-l într-o listă „Necesită aprobare” la final.

Lucrează pe o ramură nouă (`git checkout -b mobile-redesign`), fără commit-uri fără să-ți cer, fără push.

---

## 1. Faza 1 — Analiză (doar citire, fără modificări)

1. Află stack-ul (framework, router, styling, bibliotecă de componente, cum se citesc / scriu datele) și scrie-mi pe scurt.
2. Fă inventarul paginilor și al acțiunilor pe care le face un profesor (prezență, temă, notițe, orar, listă de copii / grupe etc.).
3. Identifică, cu `fișier:linie`:
   - cum e navigația acum pe telefon și ce nu merge;
   - overflow orizontal, elemente nealiniate, margini inconsecvente, texte care ies din carduri, ținte de atingere mici;
   - ce încetinește: biblioteci grele importate static, cascade de cereri, liste fără paginare, imagini neoptimizate, `backdrop-filter` pe elemente repetate, fonturi blocante;
   - toate locurile din cod care SCRIU date (ca să știm ce nu se atinge).
4. Propune planul (pașii de mai jos adaptați la proiect) și **așteaptă confirmarea mea** înainte de implementare.

---

## 2. Model de referință (din ByteSale CRM, aplicația noastră de vânzări, deja finisată pe mobil)

Reproduce aceste principii, adaptate la stack-ul de aici (nu copia cod de business):

### Cadrul aplicației (app shell)
- **O singură structură DOM** pentru telefon și desktop: pe desktop / tabletă (`md`+) sidebar lipit în stânga; pe telefon **bară de navigație jos**, fixă, plutitoare: `fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]`, colțuri rotunjite 2xl, fundal aproape opac + bordură + umbră, 4–5 butoane egale (`flex-1`), fiecare minim 48 px înălțime, iconiță 20 px + etichetă 11 px trunchiată. Pagina curentă = pastilă plină în culoarea brandului. Badge-uri roșii mici (ex. teme de corectat, prezențe nebifate azi) cu animație scurtă la schimbarea valorii.
- **Antet** lipit sus, `pt-[env(safe-area-inset-top)]`, înălțime 56 px: pe telefon logo-ul mic (doar iconița), căutare / titlul paginii, acțiunea principală ca buton iconiță, clopoțel / avatar. Fundal translucid cu blur DOAR pe antet (un singur element), nu pe liste.
- `main`: `px-4` pe telefon (marginea paginii = 16 px peste tot), `pb-[calc(6.5rem+env(safe-area-inset-bottom))]` ca nimic să nu stea sub bara de jos; containerul principal `min-w-0 overflow-x-clip`.
- Navigația profesorului, propunere (adaptează după inventar): **Azi** (orarul zilei / lecția curentă) · **Grupe / Copii** · **Prezențe** · **Teme** · **Cont**. Ecranul „Azi” e pagina de start pe telefon: lecția în desfășurare / următoarea, cu acțiunile ei mari (Intră în lecție, Prezență, Temă).
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`. **Zoom-ul NU se dezactivează.** `theme-color` diferit pentru light / dark.

### Alegeri pe telefon = foi de jos (bottom sheets)
- Sub 768 px orice alegere dintr-o listă (select, meniu de acțiuni, filtre) se deschide ca **foaie de jos**: fundal opac, mâner sus, swipe în jos închide (foaia urmează degetul), titlu, opțiuni de minim 48 px cu bifă la cea curentă, buton „Anulează” jos; pe desktop rămâne meniu / dropdown. Fă **o singură componentă comună** (ex. `ResponsiveSelect`, `ResponsiveMenu`, `MenuSheet`) și folosește-o peste tot, nu foi scrise separat.
- Căutare automată în foaie de la ~10 opțiuni (ex. lista de copii).
- Orice meniu se închide la a doua apăsare pe declanșator, la Escape și la apăsarea în afară.
- `max-h` foaie = `min(92dvh, 100dvh - env(safe-area-inset-top) - 1rem)`, derulare internă.

### Dialoguri pe telefon
- Centrate în zona sigură (sub Dynamic Island, deasupra barei de acasă), înălțime maximă = ecranul minus zonele sigure minus 2rem, derulare internă, **butonul de salvare lipit jos** (footer `sticky`, fundal opac), titlul se rupe pe rânduri și nu intră sub X.
- Dialogurile cu multe câmpuri nu deschid tastatura singure pe telefon.
- Meniuri, dialoguri, foi, toast-uri: fundal **opac** (fără text care se vede prin ele). z-index ordonat: foi < dialoguri < meniuri < tooltip-uri.

### Aliniere și „totul în linie”
- Grile: implicit `grid-template-columns: minmax(0,1fr)`; copiii flex / grid care conțin text au `min-w-0`; nume lungi `truncate` sau `break-words`; elementele fixe dintr-un rând `shrink-0` lângă unul care se poate îngusta.
- KPI / carduri mici: 2 coloane sub `sm`, ultimul card fără pereche ocupă rândul.
- Rândurile derulabile orizontal (tab-uri de grupe / zile) ies până la marginea ecranului cu `-mx-4 px-4 scroll-px-4`, ultimul element are spațiu după el.
- Tabelele devin **liste de carduri** pe telefon (copil: nume, vârstă, prezență, ultima temă; acțiunile ca butoane mari).
- Ținte de atingere minim **44×44 px** (utilitar `tap` cu `@media (pointer: coarse)`); câmpurile au **16 px** pe telefon (`text-base md:text-sm`), altfel iOS face zoom.
- Câmpurile de dată / oră: o componentă comună care afișează data în limba aplicației și ține controlul nativ invizibil deasupra (inputul nativ pe iPhone iese din card).
- Zero overflow orizontal la 360 / 390 / 430 px — repari cauza, nu ascunzi.

### Design
- Tokenuri de culoare ca variabile CSS (`:root` + `.dark`), dark implicit + light, aceleași raze, aceleași umbre peste tot. Utilitare: `glass` (doar pentru câteva suprafețe mari), `surface` (card **fără** `backdrop-filter`, pentru orice se repetă într-o listă), `popover-surface` (opac).
- Font prin `next/font` (sau echivalent), `display: "optional"`, fără preload dacă e greu.
- Folosește identitatea ByteCode School (bytecodeschool.com, „Din simplu jucător, în CREATOR”); propune-mi o paletă și arată-mi-o înainte s-o aplici peste tot.

### Logo, favicon, PWA
- Logo nou simplu, ca SVG (o iconiță clară care merge și la 16 px + varianta cu numele aplicației), propune 2–3 variante și lasă-mă să aleg.
- Generează din el: `favicon.ico` / `icon.svg`, `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `maskable-512.png` (cu zonă sigură), legate în metadata și în `manifest` (`display: "standalone"`, `background_color`, `theme_color`, `start_url` = pagina „Azi”, `shortcuts` spre Prezențe / Teme). `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`.
- Fără service worker cu cache de date (nu vrem date vechi despre copii afișate offline).

### Mișcare
- Un singur fișier de tokenuri (durate 150–350 ms, curbe), folosite ca variabile CSS. Doar `transform` / `opacity`, niciodată proprietăți de layout. Apăsare = `scale(0.97)`; foi / dialoguri intră din direcția corectă; ieșirile mai scurte decât intrările. `prefers-reduced-motion` = doar fade-uri. Nicio animație nu întârzie o acțiune.

---

## 3. „Ultrarapidă pe telefon” — ținta: ceva apare sub 300 ms de la apăsare, și pe 3G

- **Fiecare rută are `loading.tsx`** (sau echivalent) cu skeleton de forma paginii; bara de filtre / tab-urile stau în layout-ul rutei, ca să nu dispară.
- Navigația cu `<Link>` preîncărcat; preîncărcarea completă doar pe conexiune bună (`navigator.connection`), după ce pagina curentă e gata; cache de navigare în browser (în Next: `experimental.staleTimes`), `inlineCss` dacă e disponibil.
- **Fără cascade**: autentificarea + rolul se rezolvă o singură dată pe cerere (un context cache-uit per request), citirile independente pleacă în paralel; o pagină = cel mult 2 drumuri în serie până la baza de date.
- Liste cu limită / paginare în baza de date (fără a schimba ce se scrie). Componentele repetate: simple, memoizate, fără `backdrop-filter`, fără timere proprii (un singur timer comun pentru „acum 5 min”), fără tooltip-uri Radix (folosește `title`); `content-visibility: auto` pe liste lungi.
- Bibliotecile grele (grafice, editoare de text, drag & drop, calendare) cu import dinamic + skeleton de aceeași înălțime, doar unde sunt folosite.
- Ce poate fi Server Component rămâne pe server.
- **Actualizări optimiste în UI** acolo unde EXISTĂ deja salvarea (ex. bifarea prezenței): UI-ul se schimbă imediat, apelul de salvare rămâne exact același; la eroare valoarea revine cu toast „Reîncearcă”, iar ce a scris profesorul rămâne în câmp. Butoanele de trimitere au stare de încărcare și nu permit dublu-click.
- Banner discret „Fără conexiune” când `navigator.onLine` e false.
- Imagini prin componenta optimizată (dimensiuni, `sizes`, lazy).
- Măsoară înainte și după: Lighthouse mobil (Performance, LCP, TBT, CLS), dimensiunea JS pe rută (`next build` output). Raportează-mi cifrele.

---

## 4. Verificare

- Lățimi: **360, 390, 430, 768, 1024, 1440**, light și dark.
- **WebKit (Safari iPhone) la 375 / 393 px** cu zone sigure 59 / 34 px, plus Chromium / Edge. Playwright e potrivit (WebKit + Chromium), cu throttling „Slow 3G” și CPU ×4.
- Verifică: niciun overflow orizontal, bara de jos nu acoperă conținut, dialogurile nu intră sub Dynamic Island, tastatura nu ascunde câmpul activ, foile se închid prin swipe.
- Typecheck + lint + build trec.
- `git diff --stat` la final: confirmă explicit că **nu ai modificat** fișiere de migrări / SQL / schemă / acțiuni de scriere. Dacă ai atins un fișier din zona de date, spune-mi exact ce și de ce.

## 5. Ce îmi dai la final
1. Lista schimbărilor pe ecrane (înainte / după).
2. Cifrele de performanță înainte / după.
3. Lista „Necesită aprobare” (orice ar ține de date sau schemă — neimplementat).
4. Ce n-ai putut verifica.
