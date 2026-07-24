'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';
import { signOut } from '@/app/auth-actions';
import type { Profile } from '@/lib/types';
import RealtimeRefresher from './RealtimeRefresher';
import DiplomaAlerts from './DiplomaAlerts';
import NavLinks, { type NavItem } from './NavLinks';

export default function Shell({
  profile, nav, children,
}: { profile: Profile; nav: NavItem[]; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sincronizare live cu modificările adminului */}
      <RealtimeRefresher />
      {/* Alerta "trimite diploma" - grupele care au atins 16 lectii */}
      <DiplomaAlerts profile={profile} />

      {/* Bara mobilă: logo + hamburger. Ascunsă pe ecrane mari (sidebar-ul e mereu vizibil acolo). */}
      <div className="glass sticky top-0 z-40 flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
          <span className="font-display text-[15px] font-semibold leading-tight">Bytecode School</span>
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

      <aside
        className={`glass fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto px-5 py-6 text-white transition-transform duration-300 ease-out
          lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r lg:border-line
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold text-black">{'</>'}</span>
            <span className="font-display text-[15px] font-semibold leading-tight">Bytecode School</span>
          </Link>
          <button
            onClick={closeMenu} aria-label="Închide meniul"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <NavLinks items={nav} onNavigate={closeMenu} />

        <div className="mt-6 border-t border-white/10 pt-4 lg:absolute lg:bottom-6 lg:left-5 lg:right-5 lg:mt-0">
          <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
          <p className="tag !text-white/40">{profile.role === 'admin' ? 'Administrator' : 'Profesor'}</p>
          <form action={signOut} className="mt-3">
            <button className="flex items-center gap-2 text-[13px] text-white/60 hover:text-white">
              <LogOut size={14} /> Ieși din cont
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 sm:py-7 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
