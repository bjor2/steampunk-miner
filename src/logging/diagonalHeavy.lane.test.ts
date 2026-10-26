import { readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { DigPolicy } from '../systems/bot/mineLayout'
import type { Scenario } from '../systems/scenario'
import {
  diagonalHeavyLinesOf,
  diagonalHeavyProblemsOf,
  type DigPolicyRun,
} from './diagonalHeavyBars'
import { comparisonLogOf, digPolicyRunOf } from './diagonalHeavyRuns'

// Ticket 899, the VS's diagonal-heavy check on #833 (moved here by the GD on 25 Oct): each pacing
// seed (83921, 31415, 27182) plays the bot scenario to planet 5's core twice, with its default
// level galleries and with the diagonal-heavy zigzags, and the diagonal-heavy run's seed medians
// are held to `diagonalHeavyBars.ts` on P1-P5: at least half its tunnel at 45°, 22-30 minutes a
// core, money per minute within ±5% of the cardinal run's, casing 12-20% of spend and the next
// grade at most 25% of money on arrival (#894), every ring priced by the per-metre rule and the
// lining billed a metre cut within 0.85x-1.10x the cardinal run's (path, not depth, and no angle
// multiplier). Every seed, policy and planet's row is written to the run-comparison log
// `tests/balance/diagonal-heavy.comparison.ndjson`, next to the straight bot's baseline, which is
// committed from the run that judges the ticket. A miss is reported with that log; no constant is
// retuned to pass it. Six runs of a few minutes each, so this is a lane:
//   npx vitest run src/logging/diagonalHeavy.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const COMPARISON_LOG = new URL(
  '../../tests/balance/diagonal-heavy.comparison.ndjson',
  import.meta.url,
)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const POLICIES: readonly DigPolicy[] = ['cardinal', 'diagonal_heavy']

describe('diagonal-heavy bot: casing and pace on 45° routes to planet 5 (ticket 899)', () => {
  let runs: DigPolicyRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = POLICIES.flatMap((policy) => SEEDS.map((seed) => digPolicyRunOf(scenario, seed, policy)))
    console.log(['diagonal-heavy check (ticket 899)', ...diagonalHeavyLinesOf(runs)].join('\n'))
    writeFileSync(COMPARISON_LOG, comparisonLogOf(runs))
  }, RUN_TIMEOUT_MS)

  it('cuts half its tunnel at 45° and holds pace, money, casing and the per-metre bill on P1-P5', () => {
    expect(diagonalHeavyProblemsOf(runs)).toEqual([])
  })
})
