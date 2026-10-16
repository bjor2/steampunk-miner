import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { press } from './drillGearTestSession'
import {
  coreRunOn,
  coreTicksOf,
  median,
  MIN_PACE_RATIO,
  PACE_PLANETS,
  PACE_SEEDS,
} from './drillGearPaceRuns'

// The Vertical Scaler's added acceptance on #205 (Q4 a), as the GD ruling on #392 keeps it: Bjor's
// no-cap ruling overrules "descent stays bit-paced", so the boom cuts facing down too, and the
// 0.98x stays "as a floor only": the gear never costs the bot pace, and may add any. The pacing bot
// arrives on planets 7 and 10 with on-curve levels and plays to the core twice, once bare and once
// with the vibratory bit in the head and the side cutters and reach boom switched on, on the three
// pacing seeds. The median of the per-seed pace ratios (bare ticks over geared ticks) must stay at
// or above 0.98 (#84: judged on the median of three seeds, so one run's combat cannot flip it).
// Long: a dozen bot runs, for the box Tester (`npx vitest run src/features/drill-gear/drillGearPace.test.ts`).

const TIMEOUT_MS = 60 * 60 * 1000

const GEAR_SLOTS = {
  'drill.head': 'gear.vibratory_bit',
  'drill.flank': 'gear.side_cutters',
  'drill.collar': 'gear.reach_boom',
}

/** The gear slotted and its two toggles switched on before the first trip. */
const GEAR_ON: CommandIntent[] = [
  setVehicleLoadoutCommand(GEAR_SLOTS),
  press('drill.flank'),
  press('drill.collar'),
]

describe('drill-gear pace (Vertical Scaler on #205)', () => {
  it.each(PACE_PLANETS)(
    'reaches planet %i core at no less than 0.98x the bare pace with the gear on',
    (planet) => {
      const ratios = PACE_SEEDS.map((seed) => {
        const bare = coreTicksOf(coreRunOn(planet, seed, []))
        const geared = coreTicksOf(coreRunOn(planet, seed, GEAR_ON))
        console.log(`P${planet} seed ${seed}: bare ${bare}, geared ${geared} ticks`)
        return bare / geared
      })
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_PACE_RATIO)
    },
    TIMEOUT_MS,
  )
})
