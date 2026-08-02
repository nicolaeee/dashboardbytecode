import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // Repo-ul git e cu un nivel mai sus (parinte), iar acolo a ramas accidental un
  // package-lock.json gol - fara asta, Next.js infera radacina workspace-ului
  // gresit (parintele) si "next build" pica la "Collecting page data" (nu gasea
  // paginile, cautandu-le relativ la radacina gresita).
  outputFileTracingRoot: __dirname,
  // Audit securitate M-4: headere de baza, fara CSP (necesita testare atenta separata, ca sa
  // nu blocheze iframe-urile YouTube/Vimeo sau conexiunea Realtime Supabase) - X-Frame-Options
  // e SAMEORIGIN, nu afecteaza deloc iframe-urile proprii (/roadmap.html, /stelute.html sunt
  // incarcate de pe acelasi origine) si nici iframe-urile pe care ACEASTA aplicatie le
  // afiseaza (YouTube/Vimeo) - controleaza doar daca alte site-uri pot incadra aplicatia
  // noastra intr-un iframe (protectie anti-clickjacking).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};
export default nextConfig;
