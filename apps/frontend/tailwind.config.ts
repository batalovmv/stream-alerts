import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0f',
          50: '#0f0f18',
          100: '#141420',
          200: '#1a1a2e',
          300: '#24243a',
          400: '#2a2a4a',
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
        'glow-purple': '0 0 30px rgba(124, 58, 237, 0.5)',
        'glow-card': '0 0 20px rgba(124, 58, 237, 0.15)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'gradient': 'gradient 15s ease infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.8s ease-out forwards',
        'fade-up-delayed': 'fade-up 0.8s ease-out 0.2s forwards',
        'fade-up-delayed-2': 'fade-up 0.8s ease-out 0.4s forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
