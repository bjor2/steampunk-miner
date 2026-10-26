import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { chargeOpeningLinesOf, chargeOpeningRunOf, type ChargeOpeningRun } from './chargeOpening'

// D6 #865's soft opening target: each pacing seed (83921, 31415, 27182) plays the bot scenario's
// first 5 minutes on planet 1, and the lines say when a size-1 charge first cost at most 5% of the
// money held. Soft, never a gate (the ticket): the spec only checks every seed played the window,
// and the Tester reads the lines against kDyn. A few minutes of bot play a seed, so it is a lane:
//   npx vitest run src/logging/chargeOpening.lane.test.ts
const RUN_TIMEOUT_MS = 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('charge opening: a size-1 charge on planet 1 for the bot lane', () => {
  let runs: ChargeOpeningRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((seed) => chargeOpeningRunOf(scenario, seed))
    console.log(['charge opening (ticket 865)', ...chargeOpeningLinesOf(runs)].join('\n'))
  }, RUN_TIMEOUT_MS)

  it('plays the first 5 minutes of planet 1 on every pacing seed and prints when a charge fits', () => {
    expect(runs.map((run) => run.worldSeed)).toEqual([...SEEDS])
  })
})
