import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { Scenario } from '../../systems/scenario'
import {
  formatGunPaceVerdicts,
  gunPaceVerdictsOf,
  worstGunPaceRunOf,
  type GunPaceRun,
} from './gunPaceRuns'
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './systems/boreGunLane'

// The pace gates per shot shape (ticket 380, VS on #318: "pace gates run per shape and gate on the
// worst shape, P40 headless included"). Each pacing seed plays the bot scenario to planet 40's core
// once never firing, then once per shape forced to fire at every `nextShotTick` with the gun at its
// walls (ticket 347's forced run) and that one signature module on the gun from the start: plain,
// splay choke, cementing round, earthing spike, rifled bore, strut bore. Every shape is held to
// `balance:bore`'s pins against the same never run (`gunPaceRuns.ts`), and the gate is the worst
// shape: any shape's miss fails it. The modules ride from planet 1, ahead of their nodes, so each
// shape is judged at its strongest reach over the whole campaign.
// Headless and hours long, so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/ground-gun/shapePace.lane.test.ts
// A miss is a balance finding, never a reason to retune the bot or a constant.
const LAST_PLANET = 40
const RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

const SHAPES: readonly GunPaceRun[] = [
  { name: 'plain', owned: [] },
  { name: 'splay choke', owned: [SPLAY_CHOKE_ITEM_ID] },
  { name: 'cementing round', owned: [CEMENTING_ROUND_ITEM_ID] },
  { name: 'earthing spike', owned: [EARTHING_SPIKE_ITEM_ID] },
  { name: 'rifled bore', owned: [RIFLED_BORE_ITEM_ID] },
  { name: 'strut bore', owned: [STRUT_BORE_ITEM_ID] },
]

describe('ground-gun: pace gates per shot shape to planet 40 (ticket 380)', () => {
  it(
    'keeps every shape inside the bore pins, the worst shape gating',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const seeds = PACING_WORLD_SEEDS['bot-slice']
      const verdicts = gunPaceVerdictsOf(scenario, seeds, SHAPES, LAST_PLANET)
      console.log(formatGunPaceVerdicts(verdicts))
      const worst = worstGunPaceRunOf(verdicts)
      expect(worst.problems, `worst shape: ${worst.name}`).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
