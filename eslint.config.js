import { readdirSync } from 'node:fs'
import js from '@eslint/js'
import { createNodeResolver, importX } from 'eslint-plugin-import-x'
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

// #196: the pacing bot plays endless planets, and a price as a double is Infinity past planet 582,
// so its money stays Money (cmp, div); a bounded count leaves Money only through toSafeInteger.
const MONEY_STAYS_MONEY_MESSAGE =
  'The bot keeps money as Money (#196): compare with cmp; a bounded count goes through toSafeInteger.'
const MONEY_STAYS_MONEY = [
  'CallExpression[callee.name="Number"]',
  'CallExpression[callee.name="parseFloat"]',
  'CallExpression[callee.object.name="Number"][callee.property.name="parseFloat"]',
  'CallExpression[callee.property.name="toNumber"]',
].map((selector) => ({ selector, message: MONEY_STAYS_MONEY_MESSAGE }))

// The descriptions slice formats every stat through formatAmount and formatPercent, which read the
// canonical decimal string; a double on the way would print 0 or round up at L 6007 (Vertical
// Scaler on #164, K7 #199). The same shape as the bot's ban above.
const DOUBLE_CONVERSION_MESSAGE =
  'Item card text never goes through a double (#164): format Money with formatAmount/formatPercent.'
const DOUBLE_CONVERSIONS = [
  'CallExpression[callee.property.name="toFixed"]',
  'CallExpression[callee.property.name="toPrecision"]',
  'CallExpression[callee.property.name="toLocaleString"]',
  'CallExpression[callee.name="Number"]',
  'CallExpression[callee.name="parseFloat"]',
  'CallExpression[callee.object.name="Number"][callee.property.name="parseFloat"]',
].map((selector) => ({ selector, message: DOUBLE_CONVERSION_MESSAGE }))

const DECIMAL_ONLY_IN_MONEY = {
  group: ['decimal.js', 'decimal.js/*'],
  message: 'Only src/systems/money.ts constructs a Decimal (#5); use the Money functions.',
}

// Feature slices (docs/standards/feature-slices.md): every folder under src/features is a slice,
// read at lint time, so adding a slice never edits this file.
const SLICES = readdirSync('src/features', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const KERNEL_DIRS = readdirSync('src', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'features')
  .map((entry) => `./src/${entry.name}`)
const COMPOSITION_ROOTS = ['./src/bootstrap.ts', './src/testSetup.ts', './scripts']
const SLICE_ZONES = SLICES.map((slice) => ({
  target: `./src/features/!(${slice})/**/*`,
  from: `./src/features/${slice}`,
  except: ['./index.ts'],
  message: `Another slice imports slice "${slice}" only through src/features/${slice}/index.ts.`,
}))
const KERNEL_ZONES = [
  {
    target: './src/features/*/**/*',
    from: './src/features/index.ts',
    message: 'A slice never imports the loader; it is called by the composition roots only.',
  },
  {
    target: [...KERNEL_DIRS, './src/App.tsx', './src/main.tsx'],
    from: './src/features',
    message: 'The kernel never imports a slice: slices register through the kernel registries.',
  },
  {
    target: COMPOSITION_ROOTS,
    from: './src/features',
    except: ['./index.ts'],
    message: 'Composition roots load slices only through src/features/index.ts.',
  },
]
const ART_DIRECTION_JSON = {
  group: ['**/artDirection.json'],
  message: 'Only src/systems/render/artDirection.ts reads artDirection.json.',
}
const ART_DIRECTION_LOADER = {
  group: ['**/systems/render/artDirection'],
  message:
    'Ore family, tier and grade come from the ores index; only ore-visuals reads the art direction.',
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-electron',
      'release',
      'node_modules',
      'logs',
      'coverage',
      'balance-report',
      'playwright-report',
      'test-results',
      // three's Basis transcoder, copied verbatim for KTX2Loader (docs/art-pipeline.md).
      'public/basis',
    ],
  },
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
    files: ['electron/**/*.cts', '*.config.{js,ts}', 'scripts/**/*.mjs'],
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
    files: ['src/systems/**/*.ts', 'src/features/*/systems/**/*.ts'],
    ignores: ['src/systems/**/*.test.ts', 'src/features/**/*.test.ts'],
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
      // A slice's pure rules take the authority set; its look maths in systems/render does not.
      'src/features/*/systems/**/*.ts',
    ],
    ignores: [
      'src/systems/**/*.test.ts',
      'src/features/**/*.test.ts',
      'src/features/*/systems/render/**',
    ],
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
    // The pacing bot plans in Money at any depth (#196).
    files: ['src/systems/bot/**/*.ts'],
    ignores: ['src/systems/bot/**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_IMPORT_META, ...MONEY_STAYS_MONEY] },
  },
  {
    // Scene/UI/store must not reach the platform directly; src/shell is the one bridge.
    files: [
      'src/scene/**/*.{ts,tsx}',
      'src/ui/**/*.{ts,tsx}',
      'src/store/**/*.ts',
      'src/logging/**/*.ts',
      'src/features/*/{scene,ui,store}/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Persistence goes through src/shell.' },
        { name: 'indexedDB', message: 'Persistence goes through src/shell.' },
      ],
    },
  },
  {
    // Slice boundaries: one public index per slice, and the kernel never imports a slice.
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createNodeResolver({ extensions: ['.ts', '.tsx', '.json'] })],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: [...SLICE_ZONES, ...KERNEL_ZONES] }],
    },
  },
  {
    // A second rule name, so these bans never replace the layer bans of no-restricted-imports.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/systems/render/artDirection.ts', 'src/systems/render/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [ART_DIRECTION_JSON] }],
    },
  },
  {
    // The descriptions slice bans double conversions everywhere in it. A later block naming
    // no-restricted-syntax replaces the earlier ones, so its pure rules restate the layer set.
    files: ['src/features/descriptions/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...DOUBLE_CONVERSIONS] },
  },
  {
    files: ['src/features/descriptions/systems/**/*.ts'],
    ignores: ['src/features/**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_IMPORT_META, ...DOUBLE_CONVERSIONS] },
  },
  {
    files: ['src/features/descriptions/systems/**/*.ts'],
    ignores: ['src/features/**/*.test.ts', 'src/features/*/systems/render/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_IMPORT_META,
        ...EXPONENT_OPERATOR,
        ...DOUBLE_CONVERSIONS,
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/ore-visuals/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [ART_DIRECTION_JSON, ART_DIRECTION_LOADER] },
      ],
    },
  },
)
