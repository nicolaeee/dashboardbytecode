import Link from 'next/link';
import { Lock } from 'lucide-react';

/** Mesajul standard afișat la orice încercare de acces neautorizat. */
export default function AccessDenied() {
  return (
    <div className="glass mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-line px-8 py-12 text-center shadow-card">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-150 text-lock">
        <Lock size={20} />
      </span>
      <h1 className="font-display text-xl font-semibold">Conținut blocat</h1>
      <p className="text-sm leading-relaxed text-ink/70">
        Nu ai permisiunea de a accesa acest conținut. Dacă ai nevoie de acces, contactează administratorul.
      </p>
      <Link href="/curriculum" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        Înapoi la curriculum
      </Link>
    </div>
  );
}
