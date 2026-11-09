import { createRequire } from 'node:module';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// The Next.js rules (`@next/next/*`) live in the frontend package; pnpm does not
// hoist them to the root, so resolve the plugin from frontend/.
const nextPlugin = createRequire(new URL('./frontend/package.json', import.meta.url))('@next/eslint-plugin-next');

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Same Next.js rule set the frontend's .eslintrc.json asks for (next/core-web-vitals).
    files: ['frontend/**/*.ts', 'frontend/**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // These two call context.getAncestors(), removed in ESLint 9, and crash the run.
      // Both only check Pages Router pages/_document files; the frontend is App Router
      // only (no pages/ directory, no next/document or next/head imports).
      '@next/next/no-duplicate-head': 'off',
      '@next/next/no-page-custom-font': 'off',
    },
  },
];
