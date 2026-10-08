/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D6053',
          dark: '#0A5448',
          light: '#0F7A6A',
        },
        emergency: '#DC2626',
        heading: '#0D3B3B',
        body: '#4B5563',
      },
    },
  },
  plugins: [],
};
