import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The layer rules of CLAUDE.md, enforced: they are what keeps systems/ testable with no React,
// no store, no Rapier and no Vite-only code in its import graph.
const FRAMEWORK_IMPORTS = [
  { group: ['react', 'react-dom', 'react-dom/*', 'react/*'], message: 'systems/ is React-free.' },
  { group: ['zustand', 'zustand/*'], message: 'systems/ is store-free.' },
  {
    group: ['three', 'three/*', '@react-three/*'],
    message: 'systems/ knows no rendering or physics.',
  },
  {
    group: [
      '**/store/**',
      '**/scene/**',
      '**/ui/**',
      '**/physics/**',
      '**/shell/**',
      '**/debug/**',
      '**/logging/**',
    ],
    message: 'systems/ imports nothing above it.',
  },
]

export default tseslint.config(
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'logs', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['electron/**/*.cts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Seam: Rapier is touched only in its motor layer.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/physics/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@react-three/rapier', '@dimforge/*'],
              message: 'Rapier lives behind src/physics.',
            },
          ],
        },
      ],
    },
  },
  {
    // Pure rules: no framework, no clock, no Vite-only code.
    files: ['src/systems/**/*.ts'],
    ignores: ['src/systems/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: FRAMEWORK_IMPORTS }],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass time in as dt/arguments.' },
        { object: 'performance', property: 'now', message: 'Pass time in as dt/arguments.' },
        { object: 'Math', property: 'random', message: 'Use the seeded RNG.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MetaProperty[meta.name="import"]',
          message: 'No import.meta (glob, env) in systems/.',
        },
      ],
    },
  },
  {
    // Scene/UI/store must not reach the platform directly; src/shell is the one bridge.
    files: [
      'src/scene/**/*.{ts,tsx}',
      'src/ui/**/*.{ts,tsx}',
      'src/store/**/*.ts',
      'src/logging/**/*.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Persistence goes through src/shell.' },
        { name: 'indexedDB', message: 'Persistence goes through src/shell.' },
      ],
    },
  },
)
