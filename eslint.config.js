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

// The clock and Math.random are banned in every pure rule.
const CLOCK_AND_RANDOM = [
  { object: 'Date', property: 'now', message: 'Pass time in as dt/arguments.' },
  { object: 'performance', property: 'now', message: 'Pass time in as dt/arguments.' },
  { object: 'Math', property: 'random', message: 'Use the seeded RNG.' },
]

const NO_IMPORT_META = {
  selector: 'MetaProperty[meta.name="import"]',
  message: 'No import.meta (glob, env) in systems/.',
}

// Decision #5 rule 2 and #11: the spec leaves pow, exp, log and trig implementation-approximated,
// so they can differ between OSes and Electron versions and break replay digests. Math.sqrt is exact.
const APPROXIMATED_MATH = [
  'pow',
  'exp',
  'expm1',
  'log',
  'log10',
  'log2',
  'log1p',
  'cbrt',
  'hypot',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
].map((property) => ({
  object: 'Math',
  property,
  message: 'Authority maths must be exact on every OS (#5): multiply loops, tables or Money.',
}))

const INEXACT_SYNTAX = [
  {
    selector: 'BinaryExpression[operator="**"]',
    message: 'Authority maths must be exact on every OS (#5): use a multiply loop or Money.powInt.',
  },
  {
    selector: 'AssignmentExpression[operator="**="]',
    message: 'Authority maths must be exact on every OS (#5): use a multiply loop or Money.powInt.',
  },
  {
    selector: 'CallExpression[callee.name="Number"]',
    message: 'Never convert through Number in the authority (#5): money stays Money.',
  },
]

const EXPONENT_OPERATOR = INEXACT_SYNTAX.filter(({ selector }) => selector.includes('*'))

const DECIMAL_ONLY_IN_MONEY = {
  group: ['decimal.js', 'decimal.js/*'],
  message: 'Only src/systems/money.ts constructs a Decimal (#5); use the Money functions.',
}

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
            DECIMAL_ONLY_IN_MONEY,
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
      'no-restricted-imports': [
        'error',
        { patterns: [...FRAMEWORK_IMPORTS, DECIMAL_ONLY_IN_MONEY] },
      ],
      'no-restricted-properties': ['error', ...CLOCK_AND_RANDOM],
      'no-restricted-syntax': ['error', NO_IMPORT_META],
    },
  },
  {
    // The one module allowed to construct a Decimal.
    files: ['src/systems/money.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: FRAMEWORK_IMPORTS }] },
  },
  {
    // Authority and economy maths: exact on every OS, so replay digests match (#5, #11); the
    // economy formulas use integer exponents only (#20).
    files: [
      'src/systems/authority/**/*.ts',
      'src/systems/economy/**/*.ts',
      'src/systems/vehicle/**/*.ts',
      'src/systems/money.ts',
    ],
    ignores: ['src/systems/**/*.test.ts'],
    rules: {
      'no-restricted-properties': ['error', ...CLOCK_AND_RANDOM, ...APPROXIMATED_MATH],
      'no-restricted-syntax': ['error', NO_IMPORT_META, ...INEXACT_SYNTAX],
    },
  },
  {
    // World generation (#4): a co-op guest regenerates the world from the seed, so every machine
    // must produce the same tiles. Integer maths, + - * /, floor, sqrt, min/max/abs only.
    files: ['src/systems/world/**/*.ts'],
    ignores: ['src/systems/**/*.test.ts'],
    rules: {
      'no-restricted-properties': ['error', ...CLOCK_AND_RANDOM, ...APPROXIMATED_MATH],
      'no-restricted-syntax': ['error', NO_IMPORT_META, ...EXPONENT_OPERATOR],
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
