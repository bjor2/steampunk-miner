import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { arrivedPaceSessionOn, playToCoreFrom } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'
import { median } from './phasePaceRuns'
import { quenchHandSetup, withQuenchHand } from './quenchHand'

// Quench cutters' gates (the GD ruling of 14 Oct on ticket 373), at P41 and P60 on the three pacing
// seeds. The pacing bot arrives with the on-curve levels and plays to the core twice through the
// quench hand (`quenchHand.ts`: side cutters kept engaged, the condenser run at every chance), with
// and without the combo owned, so the only difference is the cutters' heat the condenser drinks.
// - Gate 2: trips stay limited by cargo or travel share, never by the tank: the combo strands the
//   bot no more often than the run without it.
// - Gate 3: the 0.98x pace assert, the median of the per-seed ratios (#84).
// Gate 1 (net drill energy per cell at least 0.9x) holds by construction, as the refund is paid per
// dig second under a tenth of the drill's draw (`quenchCutters.test.ts`). Long: a dozen bot runs,
// for the box Tester, by name (`npx vitest run
// src/features/aetheric/quenchCuttersPace.lane.test.ts`).

const TIMEOUT_MS = 3 * 60 * 60 * 1000
const QUENCH_PLANETS = [41, 60] as const
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const MIN_PACE_RATIO = 0.98
/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND

function quenchRunOn(planet: number, seed: number, withCombo: boolean): SliceRun {
  const arrived = arrivedPaceSessionOn(planet, seed, quenchHandSetup(withCombo))
  return playToCoreFrom(withQuenchHand(arrived), planet, BUDGET_TICKS)
}

function coreTicksOf(run: SliceRun): number {
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

function strandingsOf(run: SliceRun): number {
  return run.events.filter(
    (event) => event.type === 'RescueTriggered' && event.cause === 'stranded',
  ).length
}

describe('quench cutters gates (ticket 373)', () => {
  it.each(QUENCH_PLANETS)(
    'reaches planet %i core no faster than 0.98x and never runs the tank dry more for the combo',
    (planet) => {
      const ratios = SEEDS.map((seed) => {
        const bare = quenchRunOn(planet, seed, false)
        const quenched = quenchRunOn(planet, seed, true)
        const [bareTicks, quenchedTicks] = [coreTicksOf(bare), coreTicksOf(quenched)]
        console.log(`P${planet} seed ${seed}: bare ${bareTicks}, quench ${quenchedTicks} ticks`)
        expect(strandingsOf(quenched), `P${planet} seed ${seed}`).toBeLessThanOrEqual(
          strandingsOf(bare),
        )
        return quenchedTicks / bareTicks
      })
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_PACE_RATIO)
    },
    TIMEOUT_MS,
  )
})
