import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#F5F7FA',           // text principal (deschis, pe fundal întunecat)
        night: '#0B0B0D',         // suprafețe solide întunecate (sidebar, video, login)
        slate: {
          25: 'rgba(255,255,255,.035)',
          150: 'rgba(255,255,255,.08)',
        },
        paper: '#0f0f11',         // fundal aplicație — gri cărbune cald, nu negru brut
        line: 'rgba(255,255,255,.10)', // hairline borders pe sticlă
        brand: {
          50: 'rgba(200,240,35,.12)',
          100: 'rgba(200,240,35,.20)',
          300: 'rgba(200,240,35,.55)',
          500: '#c8f023',         // accent Bytecode — verde-lime
          600: '#b3d81f',
          700: '#9ecb17',
        },
        lock: 'rgba(245,247,250,.55)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,.05) inset, 0 20px 48px -24px rgba(0,0,0,.85)',
        pop: '0 30px 90px -20px rgba(0,0,0,.9)',
        // Strălucire fină de brand — o sursă discretă de lumină, nu neon plat.
        glow: '0 0 0 1px rgba(200,240,35,.35), 0 0 20px -2px rgba(200,240,35,.35)',
        'glow-sm': '0 0 20px rgba(200,240,35,.15)',
      },
      backdropBlur: { xs: '2px' },
      borderRadius: { xl: '14px', '2xl': '18px' },
    },
  },
  plugins: [],
};
export default config;
