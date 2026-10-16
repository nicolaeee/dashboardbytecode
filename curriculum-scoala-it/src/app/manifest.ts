import type { MetadataRoute } from 'next';

/**
 * Manifest PWA - aplicatia se poate "instala" pe ecranul de start al telefonului (standalone,
 * fara bara browserului). INTENTIONAT fara service worker / cache offline: nu vrem ca un profesor
 * sa vada date vechi despre copii (prezente, stelute) cand e offline - fiecare deschidere citeste
 * datele proaspete din Supabase. start_url = "/" (redirect dupa rol: profesor -> /progress pe
 * telefon e la un tap distanta, admin -> /admin/curriculum), ca fluxul de autentificare sa ramana
 * cel existent.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ByteCode Profesori',
    short_name: 'ByteCode',
    description: 'Prezențe, steluțe și progresul copiilor - ByteCode School.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0f11',
    theme_color: '#0f0f11',
    lang: 'ro',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Progress Tracker', short_name: 'Prezențe', url: '/progress', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Registru', short_name: 'Registru', url: '/registru', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
