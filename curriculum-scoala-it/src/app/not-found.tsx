import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="tag">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">Pagina nu există</h1>
        <p className="mt-2 text-sm text-ink/60">Linkul e greșit sau conținutul a fost șters.</p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          Înapoi la început
        </Link>
      </div>
    </div>
  );
}
