import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  coreRunOn,
  coreTicksOf,
  median,
  MIN_PACE_RATIO,
  PACE_PLANETS,
  PACE_SEEDS,
} from './phasePaceRuns'
import { LANTERN_ID } from './systems/lanternItem'

// The #205 assert carried to the phase lantern (#261, the GD lock on #245: a phase takes the ticks
// the bit would need and is refused wherever the drill is, so it cannot beat the descent curve).
// The pacing bot arrives on planets 7 and 10 with on-curve levels and plays to the core twice,
// bare and with the lantern in its first slot, on the three pacing seeds; the median of the
// per-seed ratios (lantern over bare) must stay at or above 0.98 (#84: the median of three seeds).
// The bot never presses a slot, so the lantern changes nothing it does; the assert guards that
// owning it stays free of pace. Long: a dozen bot runs, for the box Tester
// (`npx vitest run src/features/aetheric/phaseLantern.pace.test.ts`).

const TIMEOUT_MS = 60 * 60 * 1000

const LANTERN_ON = [setVehicleLoadoutCommand({ 'powerup.1': LANTERN_ID })]

describe('phase lantern pace (the #205 assert, #261)', () => {
  it.each(PACE_PLANETS)(
    'reaches planet %i core no faster than 0.98x the bare time with the lantern slotted',
    (planet) => {
      const ratios = PACE_SEEDS.map((seed) => {
        const bare = coreTicksOf(coreRunOn(planet, seed, []))
        const withLantern = coreTicksOf(coreRunOn(planet, seed, LANTERN_ON))
        console.log(`P${planet} seed ${seed}: bare ${bare}, lantern ${withLantern} ticks`)
        return withLantern / bare
      })
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_PACE_RATIO)
    },
    TIMEOUT_MS,
  )
})
