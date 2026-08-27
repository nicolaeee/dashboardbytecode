'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };
/** O categorie de tip acordeon (ex: "ECHIPĂ") - vezi getAdminNavItems in lib/adminNav.tsx.
 * O lista plata (profesor) nu contine niciun NavGroup, doar NavItem - NavLinks randeaza
 * ambele forme identic ca inainte pentru NavItem-urile de nivel superior. */
export type NavGroup = { title: string; items: NavItem[] };
export type NavSection = NavItem | NavGroup;

function isGroup(section: NavSection): section is NavGroup {
  return 'items' in section;
}

function NavLink({
  item, active, collapsed, onNavigate,
}: { item: NavItem; active: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition
        ${active ? 'bg-brand-500 text-black shadow-glow' : 'text-white/60 hover:bg-white/5 hover:text-white'}
        ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
    >
      {item.icon}
      {/* Textul ramane in DOM mereu (nu doar la lg) - un `collapsed` mostenit din localStorage
          nu trebuie sa goleasca vizual meniul mobil off-canvas, care nu e niciodata "restrans". */}
      <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
    </Link>
  );
}

export default function NavLinks({
  items, onNavigate, collapsed,
}: { items: NavSection[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  // Acordeoanele (Admin) pornesc INCHISE implicit - la prima incarcare nu se aglomereaza
  // vizual cu toate categoriile desfasurate deodata; profesorul/adminul le deschide manual,
  // la click. Starea de deschis/inchis e locala per randare a componentei, nu persistata -
  // se reseteaza la reincarcarea paginii, exact ca un acordeon obisnuit.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (title: string) => openGroups[title] ?? false;
  const toggleGroup = (title: string) => setOpenGroups((g) => ({ ...g, [title]: !isGroupOpen(title) }));

  return (
    <nav className="flex flex-col gap-1">
      {items.map((section) => {
        if (!isGroup(section)) {
          return <NavLink key={section.href} item={section} active={isActive(section)} collapsed={collapsed} onNavigate={onNavigate} />;
        }
        const open = isGroupOpen(section.title);
        return (
          <div key={section.title} className="mt-2 first:mt-0">
            <button
              type="button"
              onClick={() => toggleGroup(section.title)}
              aria-expanded={open}
              // La sidebar restrans (desktop), antetul categoriei (text + chevron) dispare -
              // ramane doar lista plata de iconite (vezi `open || collapsed` mai jos). La sidebar
              // mobil off-canvas (mereu "expandat"), antetul e mereu vizibil - vezi comentariul
              // din NavLink mai sus, acelasi motiv.
              className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40 transition hover:text-white/70
                ${collapsed ? 'lg:hidden' : ''}`}
            >
              {section.title}
              <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {(open || collapsed) && (
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item)} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
