import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist/', '**/node_modules/', '**/coverage/', '**/*.js', '!eslint.config.js'],
  },

  // TypeScript files
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import-x': importX,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Import order
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    files: ['apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    rules: {
      'max-lines': 'off',
    },
  },

  {
    files: ['apps/**/src/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Disable rules that conflict with Prettier
  prettier,
];
