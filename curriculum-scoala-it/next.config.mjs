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
};
export default nextConfig;
