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
import { SHIPPED_AUTO_GUNS_MODULES } from './systems/autoGunsLane'

// The forced-gun pace gate with the turrets on (ticket 388, the GD ruling on #319 with the VS
// conditions): each pacing seed plays the bot scenario to planet 40's core once never firing, then
// once per turret module forced to fire the bore gun at every `nextShotTick` with its tracks at
// their walls, the bot mounting the turret when it is offered (#107) and that one auto_guns module
// owned from the start, plus a run with the bare turret. Every run is held to `balance:bore`'s
// pins against the same never run (`gunPaceRuns.ts`: time to core at least 0.98x on every planet,
// departure drill_power within 1 level, the campaign scaling gate), and the worst module gates.
// The modules ride from planet 1, ahead of their nodes, so each is judged at its strongest reach.
// Headless and hours long, so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/ground-gun/turretPace.lane.test.ts
// A miss is a balance finding, never a reason to retune the bot or a constant.
const LAST_PLANET = 40
const RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

const TURRET_RUNS: readonly GunPaceRun[] = [
  { name: 'bare turret', owned: [] },
  ...SHIPPED_AUTO_GUNS_MODULES.map((module) => ({ name: module.name, owned: [module.itemId] })),
]

describe('ground-gun: forced-gun pace gate with the turrets on, per module, to planet 40 (ticket 388)', () => {
  it(
    'keeps every turret module inside the bore pins, the worst module gating',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const seeds = PACING_WORLD_SEEDS['bot-slice']
      const verdicts = gunPaceVerdictsOf(scenario, seeds, TURRET_RUNS, LAST_PLANET)
      console.log(formatGunPaceVerdicts(verdicts))
      const worst = worstGunPaceRunOf(verdicts)
      expect(worst.problems, `worst module: ${worst.name}`).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
