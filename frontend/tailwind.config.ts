import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        agap: {
          // Pearl/green palette — mirrors mobile/src/theme/tokens.ts
          pearl:      '#F2F5F8',
          green:      '#0D6053',
          greenSoft:  '#EEF7F4',
          surface:    '#EDF1F4',
          textMain:   '#1C2B3A',
          textMid:    '#40536D',
          textSub:    '#8795A3',
          track:      '#DCE3E9',
          danger:     '#D44858',
          dangerSoft: '#FDF0F1',
          amber:      '#D97706',
          amberSoft:  '#FFFBEB',
          info:       '#3B82F6',
          infoSoft:   '#EFF6FF',
          // Status accents (shared semantic tokens)
          red:    '#DC2626',
          orange: '#EA580C',
          yellow: '#CA8A04',
          blue:   '#1D4ED8',
          // Retained for backward-compat; retire incrementally
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
        card:  '0 4px 16px rgba(135, 149, 163, 0.09)',
        tile:  '0 4px 12px rgba(122, 136, 152, 0.09)',
        green: '0 4px 12px rgba(13, 96, 83, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
