import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  browserSpecPathsOf,
  namedSpecsMissingOnDisk,
  regExpOfGlob,
  selectAffectedSpecs,
  specsNoRuleNames,
} from './affectedSpecs.mjs'

const MAP = JSON.parse(readFileSync(new URL('../../e2e/affected.json', import.meta.url), 'utf8'))
const SPECS = browserSpecPathsOf(
  readdirSync(new URL('../../e2e/browser', import.meta.url), { recursive: true }),
)

const select = (...changed) => selectAffectedSpecs(MAP, SPECS, changed)

describe('e2e: affected-spec map', () => {
  it('names every browser spec on disk in at least one rule', () => {
    expect(SPECS.length).toBeGreaterThan(0)
    expect(specsNoRuleNames(MAP, SPECS)).toEqual([])
  })

  it('names only specs that exist on disk', () => {
    expect(namedSpecsMissingOnDisk(MAP, SPECS)).toEqual([])
  })

  it.each([
    'playwright.config.ts',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
    'index.html',
    'tsconfig.json',
    'e2e/affected.json',
    'e2e/browser/sellBurstSales.ts',
    'e2e/browser/screens/screenHelpers.ts',
    'scripts/e2e/runAffectedSpecs.mjs',
  ])('runs the full suite when %s changes', (path) => {
    expect(select('src/features/sell-burst/register.ts', path).mode).toBe('full')
  })

  it('runs the full suite for a path no rule maps', () => {
    expect(select('src/store/gameStore.ts')).toMatchObject({
      mode: 'full',
      reason: 'no rule in e2e/affected.json maps src/store/gameStore.ts',
    })
  })

  it('runs a changed spec by itself', () => {
    expect(select('e2e/browser/screens/portrait.spec.ts')).toMatchObject({
      mode: 'affected',
      specs: ['e2e/browser/screens/portrait.spec.ts'],
    })
  })

  it("runs a slice's specs when only that slice changes", () => {
    expect(select('src/features/sell-burst/burst.ts').specs).toEqual([
      'e2e/browser/sellBurst.spec.ts',
    ])
  })

  it('runs the snapshot spec when only the debug-run snapshot writers change', () => {
    expect(select('src/systems/snapshots/planetChange.ts', 'src/shell/storedZip.ts')).toEqual({
      mode: 'affected',
      reason: '2 changed path(s) map to 1 spec(s)',
      specs: ['e2e/browser/snapshots.spec.ts'],
    })
  })

  it('runs the rack, front and frame-budget specs when the dynamite looks change', () => {
    expect(select('src/features/dynamite-visuals/register.ts').specs).toEqual([
      'e2e/browser/dynamiteVisuals.spec.ts',
      'e2e/browser/render.spec.ts',
      'e2e/browser/vehiclePieces.spec.ts',
    ])
  })

  it('joins the specs of every changed path once, sorted', () => {
    const choice = select('src/features/sell-burst/burst.ts', 'src/features/example/register.ts')
    expect(choice.specs).toEqual([
      'e2e/browser/sellBurst.spec.ts',
      'e2e/browser/sliceScreen.spec.ts',
      'e2e/browser/smoke.spec.ts',
      'e2e/browser/vehiclePieces.spec.ts',
    ])
  })

  it('runs nothing for docs, unit tests and the packaged build', () => {
    expect(
      select('docs/design.md', 'src/systems/money.test.ts', 'electron/main.cts', 'README.md'),
    ).toEqual({ mode: 'none', reason: 'no changed path reaches the browser build', specs: [] })
  })
})

describe('e2e: affected-spec globs', () => {
  it('lets ** cross folders and * stay inside one', () => {
    expect(regExpOfGlob('src/features/workshop/**').test('src/features/workshop/a/b.ts')).toBe(true)
    expect(regExpOfGlob('src/**/*.test.ts').test('src/a.test.ts')).toBe(true)
    expect(regExpOfGlob('tsconfig*.json').test('tsconfig.e2e.json')).toBe(true)
    expect(regExpOfGlob('scenarios/bot-*.json').test('scenarios/x/bot-a.json')).toBe(false)
  })

  it('matches dots literally', () => {
    expect(regExpOfGlob('index.html').test('indexxhtml')).toBe(false)
  })
})
