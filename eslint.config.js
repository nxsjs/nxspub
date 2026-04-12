// @ts-check
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import importX from 'eslint-plugin-import-x'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import { builtinModules } from 'node:module'

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/temp/**',
      '**/coverage/**',
      '.idea/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      'import-x': importX,
      '@typescript-eslint': /** @type {any} */ (tsPlugin),
    },
    rules: {
      'no-debugger': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],

      'import-x/no-nodejs-modules': [
        'error',
        { allow: builtinModules.map(mod => `node:${mod}`) },
      ],
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      'no-unused-vars': ['error', { vars: 'all', args: 'none' }],
    },
  },
  {
    files: [
      'eslint.config.js',
      'vitest.config.ts',
      'tsdown.config.ts',
      'nxspub.config.ts',
      'scripts/**',
      './*.{js,ts}',
    ],
    rules: {
      'no-restricted-globals': 'off',
      'no-console': 'off',
    },
  },
)
