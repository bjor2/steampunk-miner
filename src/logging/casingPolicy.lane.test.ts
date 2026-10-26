import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { casingPolicyProblemsOf, type CasingPolicyRuns } from './casingPolicyBars'
import { casingPolicyRunOf } from './casingPolicyRuns'

// Ticket 829's bot rows: each pacing seed (83921, 31415, 27182) plays the bot scenario to planet
// 3's core with its casing on the curve, one grade short, and skipped; the medians are held to
// `casingPolicyBars.ts`. Nine runs of up to an hour each, so this is a lane:
//   npx vitest run src/logging/casingPolicy.lane.test.ts
const RUN_TIMEOUT_MS = 9 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('casing policies: the bot rows of ticket 829 on the bot lane to planet 3', () => {
  let runs: CasingPolicyRuns = { onCurve: [], oneShort: [], skip: [] }

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = {
      onCurve: SEEDS.map((seed) => casingPolicyRunOf(scenario, seed, 'on-curve')),
      oneShort: SEEDS.map((seed) => casingPolicyRunOf(scenario, seed, 'one-short')),
      skip: SEEDS.map((seed) => casingPolicyRunOf(scenario, seed, 'skip')),
    }
  }, RUN_TIMEOUT_MS)

  it('never bursts on the curve, loses at most 5% one grade short, and earns less skipping', () => {
    expect(casingPolicyProblemsOf(runs)).toEqual([])
  })
})
