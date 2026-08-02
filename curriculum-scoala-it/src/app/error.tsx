'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button, Card } from '@/components/ui';

/**
 * Error boundary global (Next.js App Router) - prinde orice eroare neasteptata din arborele
 * de pagini (sub layout-ul radacina). Nu afisam niciodata `error.message`/stack-ul catre
 * utilizator (ar putea contine detalii tehnice interne) - doar il logam in consola pentru
 * depanare, exact ca in exemplul oficial Next.js.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-5 py-10">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-500">
          <AlertTriangle size={26} />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold text-ink">A apărut o eroare neașteptată</h1>
        <p className="mt-2 text-sm leading-relaxed text-lock">
          Ne pare rău, ceva nu a funcționat cum trebuia. Încearcă din nou - dacă problema persistă,
          contactează administratorul.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()}>Încearcă din nou</Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-500"
          >
            Mergi la pagina principală
          </Link>
        </div>
      </Card>
    </div>
  );
}
