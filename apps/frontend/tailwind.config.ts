import type { Config } from 'tailwindcss';
import memelabPreset from '@memelabui/ui/preset';

export default {
  presets: [memelabPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@memelabui/ui/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      animation: {
        'fade-up-delayed-2': 'ml-fade-up 0.8s ease-out 0.4s forwards',
      },
    },
  },
  plugins: [],
} satisfies Config;
