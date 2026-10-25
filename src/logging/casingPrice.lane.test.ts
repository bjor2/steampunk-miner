import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { casingPriceLinesOf, casingPriceProblemsOf, type CasingPriceRun } from './casingPriceBars'
import { casingPriceRunOf } from './casingPriceRuns'

// #894's casing rise (Bjor's playtest, GD lock 25 Oct: the grade base x5, kCasing x10): each pacing
// seed (83921, 31415, 27182) plays the bot scenario to planet 5's core, and the planets' medians are
// held to `casingPriceBars.ts`: casing (grades + lining) 12% to 20% of everything bought on each of
// P1-P5, and the next grade at most 25% of the money held on each jump in. Each planet's collapses
// are printed for the Tester to set beside main's run. The pacing rows are the R3 lane's
// (`radiusRebaseline.lane.test.ts`) and #551's (`drillPace.lane.test.ts`). Three runs of up to an
// hour each, so this is a lane:
//   npx vitest run src/logging/casingPrice.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('casing prices: the #894 share and arrival bars on the bot lane to planet 5', () => {
  let runs: CasingPriceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = SEEDS.map((seed) => casingPriceRunOf(scenario, seed))
    console.log(['casing prices (ticket 894)', ...casingPriceLinesOf(runs)].join('\n'))
  }, RUN_TIMEOUT_MS)

  it('holds casing to 12-20% of spend on P1-P5 and the next grade to 25% of money on arrival', () => {
    expect(casingPriceProblemsOf(runs)).toEqual([])
  })

  // On main every planet asks grades 1 to 5, so a bot that skipped casing could never reach a
  // core; skipping becomes a real choice with #829's under-grade burst, which carries the row.
  it.todo('earns less money per minute skipping casing than casing (re-drill counted, #829)')
})
