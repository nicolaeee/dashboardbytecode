import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101B33',          // text principal / sidebar
        slate: {
          25: '#F7F9FC',
          150: '#E6EBF3',
        },
        paper: '#F2F5FA',        // fundal aplicatie
        line: '#E1E7F0',         // hairline borders
        brand: {
          50: '#EEF2FF',
          100: '#DDE4FF',
          300: '#9FB0FF',
          500: '#3A55E8',        // albastru electric - actiuni
          600: '#2B44CE',
          700: '#1F33A3',
        },
        lock: '#8894AC',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,27,51,.04), 0 8px 24px -12px rgba(16,27,51,.18)',
        pop: '0 12px 40px -12px rgba(16,27,51,.35)',
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
    },
  },
  plugins: [],
};
export default config;
