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
          red: '#DC2626',
          orange: '#EA580C',
          yellow: '#CA8A04',
          blue: '#1D4ED8',
          dark: '#0F172A',
        },
        priority: {
          critical: '#DC2626',
          high: '#EA580C',
          medium: '#CA8A04',
          low: '#16A34A',
        },
      },
    },
  },
  plugins: [],
};

export default config;
