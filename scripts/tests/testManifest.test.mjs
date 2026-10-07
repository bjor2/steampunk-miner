import { describe, expect, it } from 'vitest'
import {
  crossSliceCheckProblems,
  manifestDriftProblems,
  scheduledSlicesWithoutTests,
} from './manifestChecks.mjs'
import {
  countListedTests,
  countTestSites,
  readManifestFiles,
  refreshManifestFiles,
  renderTestManifest,
  staleTestPaths,
} from './testManifest.mjs'

const ROOT = '/repo'
const FILES = [
  { path: 'src/systems/world/terrain.test.ts', tests: 4, sites: 4 },
  { path: 'src/features/ores/oreCensus.test.ts', tests: 6, sites: 2 },
  { path: 'src/features/codex/logging.test.ts', tests: 3, sites: 3 },
  { path: 'scripts/status/slots.test.mjs', tests: 2, sites: 2 },
  { path: 'src/features/ores/systems/oreFamilies.test.ts', tests: 1, sites: 1 },
]
const CHECKS = [
  {
    check: 'Pacing gates',
    decidedIn: '#84',
    files: ['src/systems/world/terrain.test.ts'],
    commands: [],
    pending: null,
  },
  {
    check: 'Balance guards',
    decidedIn: '#109',
    files: [],
    commands: ['npm run balance:charges'],
    pending: null,
  },
  {
    check: 'Gate classes',
    decidedIn: '#142',
    files: [],
    commands: [],
    pending: 'not built (#148)',
  },
]
const SEEDS = [83921, 31415, 27182]

function manifestOf(files) {
  return readManifestFiles(renderTestManifest(files, CHECKS, SEEDS))
}

function diskOf(files) {
  return files.map(({ path, sites }) => ({ path, sites }))
}

describe('test manifest', () => {
  it('counts every it and test call of a source, modifiers and tables included', () => {
    const source = [
      "it('digs', () => {})",
      "  test.todo('sells')",
      "  it.each([1, 2])('counts %i', () => {})",
      '  it.skipIf(!IS_ASKED)(',
      '  it.each`',
      "expect(dig()).toBe('it(')",
      "describe('it works', () => {})",
    ].join('\n')
    expect(countTestSites(source)).toBe(5)
  })

  it('lists each slice with its files and test count, and the kernel by area', () => {
    const markdown = renderTestManifest(FILES, CHECKS, SEEDS)
    expect(markdown).toContain('### `ores`: 2 files, 7 tests')
    expect(markdown).toContain('### `codex`: 1 file, 3 tests')
    expect(markdown).toContain('### `world`\n')
    expect(markdown).toContain('### `tooling-status`\n')
    expect(markdown).toContain('| `src/features/ores/oreCensus.test.ts` | 6 | 2 |')
    expect(markdown.indexOf('### `codex`')).toBeLessThan(markdown.indexOf('### `ores`'))
  })

  it('lists the cross-slice checks with their seeds, tests, commands and what is pending', () => {
    const markdown = renderTestManifest(FILES, CHECKS, SEEDS)
    expect(markdown).toContain('Gate seeds: 83921, 31415, 27182')
    expect(markdown).toContain('| Pacing gates | #84 | `src/systems/world/terrain.test.ts` | 4 |')
    expect(markdown).toContain('| Balance guards | #109 | `npm run balance:charges` | - |')
    expect(markdown).toContain('| Gate classes | #142 | not built (#148) | - |')
  })

  it('renders the same text whatever order the files come in', () => {
    const reversed = [...FILES].reverse()
    expect(renderTestManifest(reversed, CHECKS, SEEDS)).toBe(
      renderTestManifest(FILES, CHECKS, SEEDS),
    )
  })

  it('reads back every file row it wrote and nothing from the cross-slice table', () => {
    const rows = manifestOf(FILES)
    expect([...rows.values()].sort((a, b) => (a.path < b.path ? -1 : 1))).toEqual(
      [...FILES].sort((a, b) => (a.path < b.path ? -1 : 1)),
    )
  })

  it('counts listed tests per repo-relative file', () => {
    const entries = [
      { name: 'a > digs', file: `${ROOT}/src/a.test.ts` },
      { name: 'a > sells', file: `${ROOT}/src/a.test.ts` },
      { name: 'b > runs', file: `${ROOT}/scripts/b.test.mjs` },
    ]
    expect(countListedTests(entries, ROOT)).toEqual(
      new Map([
        ['src/a.test.ts', 2],
        ['scripts/b.test.mjs', 1],
      ]),
    )
  })

  it('lists again only the files that are new or whose test sites changed', () => {
    const disk = [
      ...diskOf(FILES.slice(1)),
      { path: 'src/systems/world/terrain.test.ts', sites: 5 },
      { path: 'src/store/new.test.ts', sites: 1 },
    ]
    expect(staleTestPaths(disk, manifestOf(FILES))).toEqual([
      'src/systems/world/terrain.test.ts',
      'src/store/new.test.ts',
    ])
  })

  it('takes listed counts for refreshed files, 0 when none were collected, and keeps the rest', () => {
    const disk = [...diskOf(FILES), { path: 'src/store/skipped.test.ts', sites: 1 }]
    const refreshed = refreshManifestFiles({
      diskFiles: disk,
      manifestFiles: manifestOf(FILES),
      listedCounts: new Map([['src/features/codex/logging.test.ts', 5]]),
      refreshedPaths: new Set(['src/features/codex/logging.test.ts', 'src/store/skipped.test.ts']),
    })
    expect(refreshed.map(({ path, tests }) => [path, tests])).toEqual([
      ['src/systems/world/terrain.test.ts', 4],
      ['src/features/ores/oreCensus.test.ts', 6],
      ['src/features/codex/logging.test.ts', 5],
      ['scripts/status/slots.test.mjs', 2],
      ['src/features/ores/systems/oreFamilies.test.ts', 1],
      ['src/store/skipped.test.ts', 0],
    ])
  })

  it('drops the row of a file deleted from disk', () => {
    const refreshed = refreshManifestFiles({
      diskFiles: diskOf(FILES.slice(1)),
      manifestFiles: manifestOf(FILES),
      listedCounts: new Map(),
      refreshedPaths: new Set(),
    })
    expect(refreshed.map(({ path }) => path)).not.toContain('src/systems/world/terrain.test.ts')
  })
})

describe('test manifest drift', () => {
  it('finds nothing when the manifest matches the files on disk', () => {
    expect(manifestDriftProblems(diskOf(FILES), manifestOf(FILES))).toEqual([])
  })

  it('fails on a test added to a file without regenerating', () => {
    const disk = diskOf(FILES).map((file) =>
      file.path === 'src/features/codex/logging.test.ts' ? { ...file, sites: 4 } : file,
    )
    expect(manifestDriftProblems(disk, manifestOf(FILES))).toEqual([
      'src/features/codex/logging.test.ts has 4 test sites, the manifest 3: run `npm run tests:manifest`',
    ])
  })

  it('fails on a new test file and on a deleted one', () => {
    const disk = [...diskOf(FILES.slice(1)), { path: 'src/store/new.test.ts', sites: 1 }]
    expect(manifestDriftProblems(disk, manifestOf(FILES))).toEqual([
      'src/store/new.test.ts is not in the manifest: run `npm run tests:manifest`',
      'src/systems/world/terrain.test.ts is in the manifest but not on disk: run `npm run tests:manifest`',
    ])
  })

  it('fails on a cross-slice check naming a file that is not on disk', () => {
    const disk = new Set(['src/logging/pacingGate.test.ts'])
    const checks = [{ ...CHECKS[0], files: ['src/logging/pacingGate.test.ts', 'src/gone.test.ts'] }]
    expect(crossSliceCheckProblems(checks, disk)).toEqual([
      'cross-slice check "Pacing gates" names src/gone.test.ts, which is not on disk',
    ])
  })
})

describe('scheduled slice test guard', () => {
  it('passes a slice that ships a schedule row and has a test', () => {
    const claims = [{ rowId: 'wagons', entryId: 'codex.wagon', sliceId: 'codex' }]
    expect(scheduledSlicesWithoutTests(claims, manifestOf(FILES))).toEqual([])
  })

  it('fails a slice that ships a schedule row with zero tests in the manifest', () => {
    const files = [...FILES, { path: 'src/features/mobility/wagon.test.ts', tests: 0, sites: 1 }]
    const claims = [
      { rowId: 'wagons', entryId: 'mobility.wagon', sliceId: 'mobility' },
      { rowId: 'shields', entryId: 'tech.shield', sliceId: 'tech-tree' },
      { rowId: 'grav_anchor', entryId: 'tech.anchor', sliceId: 'tech-tree' },
    ]
    expect(scheduledSlicesWithoutTests(claims, manifestOf(files))).toEqual([
      'slice "mobility" ships schedule rows wagons but has no test in the manifest',
      'slice "tech-tree" ships schedule rows grav_anchor, shields but has no test in the manifest',
    ])
  })
})
