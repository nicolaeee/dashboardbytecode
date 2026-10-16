import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });
// Fontul mono e folosit doar pentru etichete mici (M1, L3) - fara preload, ca sa nu concureze
// cu fonturile textului principal la prima incarcare (mai ales pe 3G); pana se incarca, eticheta
// apare in ui-monospace, cu aceeasi latime aproximativa.
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: 'ByteCode Dashboard',
  description: 'Platformă internă de curriculum pentru administratori și profesori.',
  applicationName: 'ByteCode Profesori',
  // Logo-ul nou (promptul ">_" pe lime) - favicon.ico (16/32/48) + SVG pentru browserele
  // moderne, iconita Apple pentru "Adauga pe ecranul principal" si manifestul PWA (manifest.ts).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  },
  appleWebApp: { capable: true, title: 'ByteCode', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

// viewport-fit=cover: aplicatia ocupa tot ecranul pe iPhone (sub Dynamic Island / bara de acasa),
// iar zonele sigure sunt respectate explicit cu env(safe-area-inset-*) in Shell. Zoom-ul NU se
// dezactiveaza (accesibilitate) - campurile au 16px pe telefon, deci iOS nu mai face zoom singur.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0f0f11',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
