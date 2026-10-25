import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { formatNdjsonLine } from '../../logging/ndjson'
import type { Scenario } from '../../systems/scenario'
import { identityPaceProblemsOf } from './identityPaceBars'
import { identityPaceLinesOf, identityTraceRowsOf } from './identityPaceLines'
import { identityPaceRunOf, type IdentityPaceRun } from './identityPaceRuns'
import { paceBaselineMarkdownOf } from './paceBaselineDoc'

// PK7, the per-planet identity pacing gate (ticket 826; the GD lock of 24 Oct on per-planet
// identity P1-P5, its VS and Systems rows): each pacing seed (83921, 31415, 27182) plays the bot
// scenario to planet 5's core twice, skipping every merchant and with merchants on (the Cache Crate
// on P1, each planet's local tool or consumable on P2-P5). The medians are held to
// `identityPaceBars.ts`: the skip-all row passes every pacing row, merchants on keeps time and felt
// speed within 5% and decides differently on each planet, kit spend stays at most 6% per item and
// 12% together, and the premium ore is mined on the first trip after each jump in. The trace rows
// go to balance-report/planet-identity.ndjson and the rewritten pace baseline to
// balance-report/pace-baseline.md, which replaces docs/economy/pace-baseline.md. Six runs of up to
// an hour each, so this is a lane:
//   npx vitest run src/features/planet-kit/identityPace.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('planet kit: the PK7 per-planet identity gate, planets 1 to 5 (ticket 826)', () => {
  let off: IdentityPaceRun[] = []
  let on: IdentityPaceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    off = SEEDS.map((seed) => identityPaceRunOf(scenario, seed, 'off'))
    on = SEEDS.map((seed) => identityPaceRunOf(scenario, seed, 'on'))
    console.log(['PK7 identity trace (ticket 826)', ...identityPaceLinesOf(off, on)].join('\n'))
    writeReports(off, on)
  }, RUN_TIMEOUT_MS)

  it('holds every PK7 bar: skip-all pacing, paired time and felt, decisions, off-curve, signature', () => {
    expect(identityPaceProblemsOf(off, on)).toEqual([])
  })

  it('logs one trace row per seed, hand and planet', () => {
    expect(identityTraceRowsOf([...off, ...on])).toHaveLength(SEEDS.length * 2 * 5)
  })
})

/** The per-planet trace as NDJSON and the pace baseline as the doc it replaces. */
function writeReports(off: readonly IdentityPaceRun[], on: readonly IdentityPaceRun[]): void {
  const measuredOn = new Date().toISOString().slice(0, 10)
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(
    new URL('planet-identity.ndjson', REPORT_FOLDER),
    identityTraceRowsOf([...off, ...on])
      .map((row) => formatNdjsonLine({ measuredOn, ...row }))
      .join(''),
  )
  writeFileSync(
    new URL('pace-baseline.md', REPORT_FOLDER),
    `${paceBaselineMarkdownOf(off, on, measuredOn)}\n`,
  )
}
