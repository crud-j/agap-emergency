import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        agap: {
          pearl:      '#EFF3F7',
          green:      '#0D6053',
          greenSoft:  '#EEF7F4',
          surface:    '#EDF1F4',
          textMain:   '#0F1C2D',
          textMid:    '#3D5166',
          textSub:    '#7A8FA3',
          track:      '#D8E3EC',
          danger:     '#CF3B4E',
          dangerSoft: '#FDF0F2',
          amber:      '#C96A00',
          amberSoft:  '#FFF8EB',
          info:       '#2563EB',
          infoSoft:   '#EBF4FF',
          // Sidebar (dark navy rail)
          sidebar:    '#0A1628',
          // Status accents
          red:    '#DC2626',
          orange: '#EA580C',
          yellow: '#CA8A04',
          blue:   '#1D4ED8',
          // Retained for backward-compat
          dark:   '#0F172A',
        },
        priority: {
          critical: '#DC2626',
          high:     '#EA580C',
          medium:   '#CA8A04',
          low:      '#16A34A',
        },
      },
      boxShadow: {
        card:    '0 2px 8px rgba(15, 28, 45, 0.06), 0 1px 3px rgba(15, 28, 45, 0.04)',
        'card-md': '0 4px 16px rgba(15, 28, 45, 0.09), 0 2px 4px rgba(15, 28, 45, 0.05)',
        tile:    '0 4px 12px rgba(15, 28, 45, 0.07)',
        green:   '0 4px 12px rgba(13, 96, 83, 0.22)',
        panel:   '0 0 0 1px rgba(148,168,188,0.14), 0 4px 16px rgba(15,28,45,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
