import { describe, expect, it } from 'vitest'
import {
  formatMovePrReport,
  movePrFindings,
  pinnedHashesOf,
  testIdsOfListing,
} from './movePrGuard.mjs'

const FLOOR = 3

const LISTING = [
  { name: 'dynamite: blast > breaks band-2 rock', file: '/repo/src/systems/charges/blast.test.ts' },
  { name: 'dynamite: blast > spares the vehicle', file: '/repo/src/systems/charges/blast.test.ts' },
  { name: 'shops > sells ore at the Sell bay', file: '/repo/src/store/shops.test.ts' },
]

const FILES = [
  { path: 'tests/golden/dig-and-return.golden.json', hash: 'g1' },
  { path: 'tests/balance/bot-slice.summary.json', hash: 'b1' },
  { path: 'scenarios/bot-slice.scenario.json', hash: 's1' },
  { path: 'src/constants/pacingSeeds.ts', hash: 's2' },
  { path: 'docs/economy/price-table.md', hash: 't1' },
  { path: 'src/features/ores/ores.economy.json', hash: 't2' },
  { path: 'src/systems/charges/blast.ts', hash: 'code' },
]

function snapshotOf(listing, files) {
  return { testIds: testIdsOfListing(listing), pinned: pinnedHashesOf(files) }
}

function movedInto(slice, entry) {
  return { ...entry, file: entry.file.replace(/src\/[a-z/]+\//, `src/features/${slice}/`) }
}

function withHash(files, path, hash) {
  return files.map((file) => (file.path === path ? { ...file, hash } : file))
}

const BEFORE = snapshotOf(LISTING, FILES)

describe('tests: move-PR guard', () => {
  it('passes a clean move that relocates test files, goldens and code', () => {
    const files = [
      ...FILES.filter((file) => !file.path.endsWith('.golden.json')),
      { path: 'src/features/dynamite/golden/dig-and-return.golden.json', hash: 'g1' },
      { path: 'src/features/dynamite/blast.ts', hash: 'moved code' },
    ]
    const after = snapshotOf(
      LISTING.map((entry) => movedInto('dynamite', entry)),
      files,
    )
    expect(movePrFindings(BEFORE, after, FLOOR)).toEqual([])
    expect(formatMovePrReport(BEFORE, after, [])).toContain('PASS')
  })

  it('passes a move that adds tests', () => {
    const listing = [...LISTING, { name: 'shops > refuses an empty bag', file: '/repo/x.test.ts' }]
    expect(movePrFindings(BEFORE, snapshotOf(listing, FILES), FLOOR)).toEqual([])
  })

  it('fails a move that drops a test', () => {
    const findings = movePrFindings(BEFORE, snapshotOf(LISTING.slice(1), FILES), FLOOR)
    expect(findings).toEqual([
      { kind: 'test-count', before: 3, after: 2, floor: FLOOR },
      { kind: 'missing-test-id', id: 'dynamite: blast > breaks band-2 rock', lost: 1 },
    ])
  })

  it('fails a test count under the floor even when nothing was dropped', () => {
    const findings = movePrFindings(BEFORE, BEFORE, 4)
    expect(findings).toEqual([{ kind: 'test-count', before: 3, after: 3, floor: 4 }])
  })

  it('fails a move that renames a test ID', () => {
    const listing = LISTING.map((entry, at) =>
      at === 2 ? { ...entry, name: '[shops] shops > sells ore at the Sell bay' } : entry,
    )
    expect(movePrFindings(BEFORE, snapshotOf(listing, FILES), FLOOR)).toEqual([
      { kind: 'missing-test-id', id: 'shops > sells ore at the Sell bay', lost: 1 },
    ])
  })

  it('counts a test ID that two files share once per copy', () => {
    const before = snapshotOf([...LISTING, LISTING[2]], FILES)
    const findings = movePrFindings(before, BEFORE, FLOOR)
    expect(findings).toContainEqual({
      kind: 'missing-test-id',
      id: 'shops > sells ore at the Sell bay',
      lost: 1,
    })
  })

  it('fails a move that changes a golden, the balance baseline, a seed or a table', () => {
    const cases = [
      ['tests/golden/dig-and-return.golden.json', 'golden:dig-and-return.golden.json'],
      ['tests/balance/bot-slice.summary.json', 'balance:bot-slice.summary.json'],
      ['scenarios/bot-slice.scenario.json', 'seed:bot-slice.scenario.json'],
      ['src/constants/pacingSeeds.ts', 'seed:src/constants/pacingSeeds.ts'],
      ['docs/economy/price-table.md', 'table:docs/economy/price-table.md'],
      ['src/features/ores/ores.economy.json', 'table:src/features/ores/ores.economy.json'],
    ]
    for (const [path, id] of cases) {
      const after = snapshotOf(LISTING, withHash(FILES, path, 'edited'))
      expect(movePrFindings(BEFORE, after, FLOOR)).toEqual([{ kind: 'pinned-file-changed', id }])
    }
  })

  it('fails a move that relocates a table the Vertical Scaler reads by path', () => {
    const files = FILES.map((file) =>
      file.path === 'docs/economy/price-table.md'
        ? { ...file, path: 'src/features/shops/price-table.md' }
        : file,
    )
    expect(movePrFindings(BEFORE, snapshotOf(LISTING, files), FLOOR)).toEqual([
      { kind: 'pinned-file-missing', id: 'table:docs/economy/price-table.md' },
    ])
  })

  it('fails a move that adds a golden or balance output', () => {
    const files = [...FILES, { path: 'tests/golden/new-run.golden.json', hash: 'g2' }]
    expect(movePrFindings(BEFORE, snapshotOf(LISTING, files), FLOOR)).toEqual([
      { kind: 'pinned-file-added', id: 'golden:new-run.golden.json' },
    ])
  })

  it('fails balance output that differs between the two trees', () => {
    const before = { ...BEFORE, pinned: { ...BEFORE.pinned, 'balance-output:report': 'r1' } }
    const after = { ...BEFORE, pinned: { ...BEFORE.pinned, 'balance-output:report': 'r2' } }
    const findings = movePrFindings(before, after, FLOOR)
    expect(findings).toEqual([{ kind: 'pinned-file-changed', id: 'balance-output:report' }])
    expect(formatMovePrReport(before, after, findings)).toContain(
      'FAIL: 1 finding(s)\n- pinned file changed: balance-output:report',
    )
  })

  it('ignores files nothing pins', () => {
    const after = snapshotOf(LISTING, withHash(FILES, 'src/systems/charges/blast.ts', 'edited'))
    expect(movePrFindings(BEFORE, after, FLOOR)).toEqual([])
  })
})
