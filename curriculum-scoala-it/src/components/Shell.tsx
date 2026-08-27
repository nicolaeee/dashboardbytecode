'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';
import { signOut } from '@/app/auth-actions';
import type { Profile, TeacherLevel } from '@/lib/types';
import { Badge } from './ui';
import RealtimeRefresher from './RealtimeRefresher';
import NavLinks, { type NavSection } from './NavLinks';

// Aceeasi paleta ca in admin/teachers/TeachersClient.tsx (lista de profesori) - pastrata
// consistenta ca profesorul sa isi recunoasca gradul cu aceeasi culoare oriunde apare.
const LEVEL_TONES: Record<TeacherLevel, 'blue' | 'purple' | 'brand'> = {
  Junior: 'blue', Middle: 'purple', Senior: 'brand',
};

const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

export default function Shell({
  profile, nav, children,
}: { profile: Profile; nav: NavSection[]; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  // Restrangere/extindere pe desktop (toti utilizatorii, admin sau profesor) - persistata local,
  // ca preferinta sa ramana intre vizite. Pornim mereu de la false (identic cu ce randeaza
  // serverul) si citim localStorage abia dupa montare, ca sa nu existe mismatch de hidratare
  // intre randarea server-side si ce ar putea fi salvat in browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1');
    } catch {
      // localStorage indisponibil (mod privat etc.) - ramane extins, fara sa blocheze pagina.
    }
  }, []);

  // Acelasi buton (iconita de langa "ByteCode Dashboard") are doua roluri, dupa context - nu se
  // adauga alt buton de meniu. Pe mobil, cat timp overlay-ul off-canvas e deschis, il inchide
  // (ca inainte). Pe desktop (unde overlay-ul off-canvas nu se foloseste niciodata - sidebar-ul
  // e mereu vizibil, vezi `lg:translate-x-0` mai jos), comuta restrans/extins.
  function handleSidebarToggleClick() {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // best-effort - restrangerea tot functioneaza pentru sesiunea curenta.
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Sincronizare live cu modificările adminului */}
      <RealtimeRefresher />
      {/* Alertele de diplomă (per elev, din prezențele lui individuale) sunt in
          "🚨 Task-uri Urgente" din Progress Tracker. */}

      {/* Bara mobilă: logo + hamburger. Ascunsă pe ecrane mari (sidebar-ul e mereu vizibil acolo). */}
      <div className="glass sticky top-0 z-40 flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
          <span className="font-display text-[15px] font-semibold leading-tight">ByteCode Dashboard</span>
        </Link>
        <button
          onClick={() => setMenuOpen(true)} aria-label="Deschide meniul"
          className="grid h-9 w-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/5 hover:text-white"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Fundal semi-transparent - inchide meniul la atingere in afara lui */}
      {menuOpen && (
        <div onClick={closeMenu} aria-hidden className="fixed inset-0 z-40 bg-black/70 lg:hidden" />
      )}

      {/* flex flex-col + h-screen: 3 zone fixe pe verticala (antet / navigare / profil) -
          navigarea (singura care poate creste mult, cu mai multe acordeoane deschise deodata)
          e SINGURA care face scroll intern (flex-1 overflow-y-auto mai jos); antetul si
          profilul raman mereu vizibile, in afara zonei de scroll, deci nu mai pot fi acoperite
          de link-uri. Acelasi container serveste si sidebar-ul mobil off-canvas (fixed
          inset-y-0 => h-screen = inaltimea reala a ecranului acolo) - un singur layout, nu
          doua separate. */}
      <aside
        className={`glass fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[85vw] flex-col px-5 py-6 text-white transition-transform duration-300 ease-out
          lg:sticky lg:top-0 lg:z-auto lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r lg:border-line lg:transition-[width] lg:duration-200
          ${collapsed ? 'lg:w-20 lg:px-3' : 'lg:w-64'}
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Acelasi (si singurul) buton de toggle - vezi handleSidebarToggleClick mai sus. Cand
            sidebar-ul e restrans (doar desktop), logo-ul si butonul se stivuiesc vertical (nu
            mai incap unul langa altul pe 80px latime) - pe mobil raman mereu unul langa altul,
            indiferent de `collapsed` (relevant doar la lg, vezi comentariul din NavLinks.tsx). */}
        <div className={`mb-6 flex shrink-0 items-center justify-between ${collapsed ? 'lg:flex-col lg:justify-center lg:gap-2' : ''}`}>
          <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
            <span className={`font-display text-[15px] font-semibold leading-tight ${collapsed ? 'lg:hidden' : ''}`}>ByteCode Dashboard</span>
          </Link>
          <button
            onClick={handleSidebarToggleClick}
            aria-label={collapsed ? 'Extinde meniul' : menuOpen ? 'Închide meniul' : 'Restrânge meniul'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            {collapsed && !menuOpen ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* Zona de navigare - singura care face scroll cand acordeoanele deschise nu mai incap
            (vezi comentariul de mai sus). min-h-0 e necesar ca flex-1 sa poata chiar sa se
            micsoreze sub inaltimea continutului - fara el, flexbox ar creste containerul la
            inaltimea completa a link-urilor in loc sa scroleze intern, iar overflow-y-auto
            n-ar avea niciun efect vizibil. */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <NavLinks items={nav} onNavigate={closeMenu} collapsed={collapsed} />
        </div>

        {/* Profil, ancorat la baza containerului (flex-col + shrink-0) - NU mai foloseste
            positionare absoluta, deci nu se mai poate suprapune peste navigare indiferent
            cate acordeoane sunt deschise simultan. */}
        <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
          <p className={`truncate text-sm font-medium ${collapsed ? 'lg:hidden' : ''}`}>{profile.full_name || profile.email}</p>
          <div className={`mt-1.5 ${collapsed ? 'lg:hidden' : ''}`}>
            <Badge tone={profile.role === 'admin' ? 'brand' : LEVEL_TONES[profile.level]}>
              {profile.role === 'admin' ? 'Administrator' : profile.level}
            </Badge>
          </div>
          <form action={signOut} className={`mt-3 ${collapsed ? 'lg:mt-2' : ''}`}>
            <button
              title="Ieși din cont"
              className={`flex items-center gap-2 text-[13px] text-white/60 hover:text-white ${collapsed ? 'lg:justify-center lg:w-full' : ''}`}
            >
              <LogOut size={14} /> <span className={collapsed ? 'lg:hidden' : ''}>Ieși din cont</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 sm:py-7 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
