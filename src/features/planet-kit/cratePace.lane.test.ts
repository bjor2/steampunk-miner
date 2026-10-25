import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { Scenario } from '../../systems/scenario'
import { cratePaceLinesOf, cratePaceProblemsOf } from './cratePaceBars'
import { CRATES_OFF, CRATES_ON, cratePaceRunOf, type CratePaceRun } from './cratePaceRuns'

// The crates on/off replay (ticket 850; #823's VS row 1, moved here by the GD's final lock on
// #850): each pacing seed (83921, 31415, 27182) plays the bot scenario to planet 5's core twice,
// the crate policy off and `drop_on_full`, and the medians are held to `cratePaceBars.ts`: with
// crates on, 22 to 30 minutes a planet and money per minute within 5% of the #551 equilibrium step
// wherever crates off holds them, and the cargo hold never more than 1 level behind crates off.
// A miss is the crate's balance finding (its price or cap, never the cargo curve). Six runs of up
// to an hour each, so this is a lane:
//   npx vitest run src/features/planet-kit/cratePace.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('planet kit: the crates on/off replay, planets 1 to 5 (ticket 850)', () => {
  let off: CratePaceRun[] = []
  let on: CratePaceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    off = SEEDS.map((seed) => cratePaceRunOf(scenario, seed, CRATES_OFF))
    on = SEEDS.map((seed) => cratePaceRunOf(scenario, seed, CRATES_ON))
    console.log(['Crates on/off replay (ticket 850)', ...cratePaceLinesOf(off, on)].join('\n'))
  }, RUN_TIMEOUT_MS)

  it('buys crates at the planet 1 merchant on every seed with the policy on', () => {
    expect(on.map((run) => run.cratesBought > 0)).toEqual(SEEDS.map(() => true))
    expect(off.map((run) => run.cratesBought)).toEqual(SEEDS.map(() => 0))
  })

  it('keeps time, money per minute and cargo buys within the VS bars with crates on', () => {
    expect(cratePaceProblemsOf(off, on)).toEqual([])
  })
})
