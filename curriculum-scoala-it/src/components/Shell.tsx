'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, LogOut, Menu, MoreHorizontal, X } from 'lucide-react';
import { signOut } from '@/app/auth-actions';
import type { Profile, TeacherLevel } from '@/lib/types';
import { Badge } from './ui';
import RealtimeRefresher from './RealtimeRefresher';
import NavLinks, { type NavItem, type NavSection } from './NavLinks';
import BottomSheet from './BottomSheet';
import OfflineBanner from './OfflineBanner';
import Logo from './Logo';

// Aceeasi paleta ca in admin/teachers/TeachersClient.tsx (lista de profesori) - pastrata
// consistenta ca profesorul sa isi recunoasca gradul cu aceeasi culoare oriunde apare.
const LEVEL_TONES: Record<TeacherLevel, 'blue' | 'purple' | 'brand'> = {
  Junior: 'blue', Middle: 'purple', Senior: 'brand',
};

const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

// Bara de jos de pe telefon: cele mai folosite 3 pagini + "Mai mult" (restul meniului intr-o
// foaie de jos). Ordinea de aici e ordinea din bara. Paginile care lipsesc din meniul contului
// (ex. un profesor fara un modul) sunt pur si simplu sarite.
const PRIMARY_HREFS: Record<Profile['role'], string[]> = {
  teacher: ['/progress', '/curriculum', '/registru'],
  admin: ['/admin/task-uri-urgente', '/progress', '/admin/curriculum'],
};

function isGroup(section: NavSection): section is Extract<NavSection, { items: NavItem[] }> {
  return 'items' in section;
}

export default function Shell({
  profile, nav, children,
}: { profile: Profile; nav: NavSection[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

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

  // Foaia "Mai mult" se inchide singura la orice navigare (inclusiv butonul Inapoi).
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // Butonul de langa logo, pe desktop, comuta restrans/extins. Pe telefon sidebar-ul nu mai
  // exista (inlocuit de bara de jos), deci butonul are un singur rol.
  function handleSidebarToggleClick() {
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

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  // Impartirea meniului pentru telefon: butoanele din bara + ce intra in "Mai mult" (pastrand
  // categoriile adminului ca titluri de sectiune in foaie).
  const { primary, moreSections } = useMemo(() => {
    const flat = nav.flatMap((s) => (isGroup(s) ? s.items : [s]));
    const primaryHrefs = PRIMARY_HREFS[profile.role] ?? [];
    const primary = primaryHrefs
      .map((href) => flat.find((i) => i.href === href))
      .filter((i): i is NavItem => !!i);
    const taken = new Set(primary.map((i) => i.href));
    const moreSections: { title: string | null; items: NavItem[] }[] = [];
    const loose: NavItem[] = [];
    for (const s of nav) {
      if (isGroup(s)) {
        const items = s.items.filter((i) => !taken.has(i.href));
        if (items.length) moreSections.push({ title: s.title, items });
      } else if (!taken.has(s.href)) {
        loose.push(s);
      }
    }
    if (loose.length) moreSections.unshift({ title: null, items: loose });
    return { primary, moreSections };
  }, [nav, profile.role]);

  const activeItem = nav.flatMap((s) => (isGroup(s) ? s.items : [s])).find(isActive);
  const moreActive = !primary.some(isActive) && !!activeItem;
  const moreBadge = moreSections.reduce((n, s) => n + s.items.reduce((m, i) => m + (i.badge ?? 0), 0), 0);
  const displayName = profile.full_name || profile.email;
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

  return (
    <div className="min-h-screen lg:flex">
      {/* Sincronizare live cu modificările adminului */}
      <RealtimeRefresher />
      <OfflineBanner />
      {/* Alertele de diplomă (per elev, din prezențele lui individuale) sunt in
          "🚨 Task-uri Urgente" din Progress Tracker. */}

      {/* ANTET MOBIL (sub lg): logo mic, titlul paginii, avatar (deschide "Mai mult"). Lipit sus,
          sub zona sigura (Dynamic Island), 56px. Singurul element cu blur pe telefon. */}
      <header className="glass-header sticky top-0 z-30 border-b border-line pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" aria-label="Acasă" className="press -m-1.5 shrink-0 p-1.5">
            <Logo size={30} />
          </Link>
          <p className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold leading-tight">
            {activeItem?.label.replace(/\s*\(\d+\)$/, '') ?? 'ByteCode'}
          </p>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="Contul meu și alte pagini"
            className="press tap grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[.08] text-[13px] font-semibold text-ink"
          >
            {initials}
          </button>
        </div>
      </header>

      {/* SIDEBAR DESKTOP (lg+) - neschimbat fata de versiunea anterioara; pe telefon nu se mai
          randeaza (inlocuit de bara de jos + foaia "Mai mult").
          flex flex-col + h-screen: 3 zone fixe pe verticala (antet / navigare / profil) -
          navigarea e SINGURA care face scroll intern; antetul si profilul raman mereu vizibile. */}
      <aside
        className={`glass sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line py-6 text-white transition-[width] duration-200 lg:flex
          ${collapsed ? 'w-20 px-3' : 'w-64 px-5'}`}
      >
        {/* Cand sidebar-ul e restrans, logo-ul si butonul se stivuiesc vertical (nu mai incap
            unul langa altul pe 80px latime). */}
        <div className={`mb-6 flex shrink-0 items-center justify-between ${collapsed ? 'flex-col justify-center gap-2' : ''}`}>
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
            <span className={`font-display text-[15px] font-semibold leading-tight ${collapsed ? 'hidden' : ''}`}>ByteCode Dashboard</span>
          </Link>
          <button
            onClick={handleSidebarToggleClick}
            aria-label={collapsed ? 'Extinde meniul' : 'Restrânge meniul'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* Zona de navigare - singura care face scroll cand acordeoanele deschise nu mai incap.
            min-h-0 e necesar ca flex-1 sa poata chiar sa se micsoreze sub inaltimea continutului. */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <NavLinks items={nav} collapsed={collapsed} />
        </div>

        {/* Profil, ancorat la baza containerului (flex-col + shrink-0). */}
        <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
          <p className={`truncate text-sm font-medium ${collapsed ? 'hidden' : ''}`}>{displayName}</p>
          <div className={`mt-1.5 ${collapsed ? 'hidden' : ''}`}>
            <Badge tone={profile.role === 'admin' ? 'brand' : LEVEL_TONES[profile.level]}>
              {profile.role === 'admin' ? 'Administrator' : profile.level}
            </Badge>
          </div>
          <form action={signOut} className={collapsed ? 'mt-2' : 'mt-3'}>
            <button
              title="Ieși din cont"
              className={`flex items-center gap-2 text-[13px] text-white/60 hover:text-white ${collapsed ? 'w-full justify-center' : ''}`}
            >
              <LogOut size={14} /> <span className={collapsed ? 'hidden' : ''}>Ieși din cont</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Pe telefon: margine de 16px peste tot si spatiu jos ca nimic sa nu stea sub bara de
          navigare plutitoare. Pe desktop paddingul e exact cel de dinainte. */}
      <main className="min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 lg:overflow-x-visible lg:px-10 lg:py-9">
        {children}
      </main>

      {/* BARA DE JOS (sub lg): fixa, plutitoare, 3 pagini + "Mai mult". Pagina curenta = pastila
          lime plina. Fundal aproape opac (fara blur) - e mereu pe ecran, deci trebuie sa fie ieftina. */}
      <nav
        aria-label="Navigare principală"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex gap-1 rounded-2xl border border-line bg-[#17171a] p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,.85)] lg:hidden"
      >
        {primary.map((item) => (
          <BottomNavButton key={item.href} href={item.href} label={item.short ?? item.label} icon={item.icon} active={isActive(item)} badge={item.badge} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={`press relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 ${moreActive || moreOpen ? 'bg-brand-500 text-black' : 'text-white/60'}`}
        >
          <MoreHorizontal size={20} />
          <span className="max-w-full truncate text-[11px] font-medium leading-tight">Mai mult</span>
          {moreBadge > 0 && <NavBadge value={moreBadge} />}
        </button>
      </nav>

      {/* Foaia "Mai mult": restul paginilor (cu categoriile adminului), contul si iesirea. */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mai mult" cancelLabel="Închide">
        <div className="space-y-4 pb-2">
          {moreSections.map((section) => (
            <div key={section.title ?? '_'}>
              {section.title && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{section.title}</p>
              )}
              <ul>
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`press flex min-h-12 items-center gap-3 rounded-xl px-3 text-base ${active ? 'bg-brand-500/15 text-brand-500' : 'text-ink'}`}
                      >
                        <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{item.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {active && <Check size={18} className="shrink-0" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="rounded-2xl border border-line bg-white/[.03] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[.08] text-sm font-semibold">{initials}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{displayName}</p>
                <div className="mt-1">
                  <Badge tone={profile.role === 'admin' ? 'brand' : LEVEL_TONES[profile.level]}>
                    {profile.role === 'admin' ? 'Administrator' : profile.level}
                  </Badge>
                </div>
              </div>
            </div>
            <form action={signOut} className="mt-3">
              <button className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line text-[15px] text-white/80">
                <LogOut size={16} /> Ieși din cont
              </button>
            </form>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function BottomNavButton({
  href, label, icon, active, badge,
}: { href: string; label: string; icon: React.ReactNode; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`press relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 ${active ? 'bg-brand-500 text-black' : 'text-white/60'}`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="max-w-full truncate text-[11px] font-medium leading-tight">{label}</span>
      {!!badge && badge > 0 && <NavBadge value={badge} />}
    </Link>
  );
}

function NavBadge({ value }: { value: number }) {
  // key={value} -> React re-monteaza bulina la fiecare schimbare, deci animatia "pop" ruleaza din nou.
  return (
    <span
      key={value}
      className="badge-pop absolute right-[calc(50%-1.25rem)] top-1 min-w-[18px] rounded-full bg-[#FF4D4D] px-1 text-center text-[10px] font-bold leading-[18px] text-white"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
