/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Mission-control dark palette
        space: {
          950: '#020817',
          900: '#0a0f1e',
          800: '#0d1526',
          700: '#111d35',
          600: '#1a2a4a',
          500: '#243558',
        },
        accent: {
          cyan:   '#22d3ee',
          green:  '#4ade80',
          yellow: '#facc15',
          red:    '#f87171',
          violet: '#a78bfa',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink':      'blink 1.2s step-end infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%':       { opacity: 0 },
        },
      },
    },
  },
  plugins: [],
}
