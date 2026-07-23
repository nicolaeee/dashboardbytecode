import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { signOut } from '@/app/auth-actions';
import type { Profile } from '@/lib/types';
import RealtimeRefresher from './RealtimeRefresher';
import NavLinks, { type NavItem } from './NavLinks';

export default function Shell({
  profile, nav, children,
}: { profile: Profile; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      {/* Sincronizare live cu modificările adminului */}
      <RealtimeRefresher />

      <aside className="relative bg-ink px-4 py-4 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:px-5 lg:py-6">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-mono text-sm font-bold">{'</>'}</span>
          <span className="font-display text-[15px] font-semibold leading-tight">
            Curriculum
            <span className="block text-[11px] font-normal text-white/50">Școala de IT</span>
          </span>
        </Link>

        <NavLinks items={nav} />

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

      <main className="min-w-0 flex-1 px-5 py-7 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
