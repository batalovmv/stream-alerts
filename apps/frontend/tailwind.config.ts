import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme matching neiro-api.memelab.ru
        surface: {
          DEFAULT: '#0a0a0f',
          50: '#0f0f18',
          100: '#141420',
          200: '#1a1a2e',
          300: '#24243a',
        },
        accent: {
          DEFAULT: '#667eea',
          light: '#8b9cf7',
          dark: '#4c5fd4',
        },
        glow: {
          purple: '#764ba2',
          pink: '#f093fb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(102, 126, 234, 0.3)',
        'glow-lg': '0 0 40px rgba(102, 126, 234, 0.4)',
      },
    },
  },
  plugins: [],
} satisfies Config;
