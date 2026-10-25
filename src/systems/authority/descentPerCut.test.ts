import { beforeAll, describe, expect, it } from 'vitest'
import { L20_FELT_DESCENT } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { withDrillSideClearance, WIDE_BORE_CLEARANCE_MM } from '../vehicle/drillBoreFixtures'
import { descentMetresPerSecondOf } from '../vehicle/cutSpeed'
import { cutColumnAtDrillStep, type DrillLadderRung } from './drillLadder'

// The cells to m/s mapping re-derived for the 1.2 m bore (ticket 663; the VS on #661: felt speed
// is the fixed point, L20 at 83.9 m/s on the bench and L1 at today's m/s, never compensated in the
// drill law). The stored-step ladder's band-1 column (`drillLadder.ts`, the cut #551's bench bar
// reads) is cut on #36's 1.9 m bore and on the shipped one: the same ticks at every step mean the
// narrower stamp left the cut speed, and so `DRILL_DESCENT_PER_CUT`, where it was.

const STEPS = [1, 10, 20]
/** The ladder's 20 band-1 cells, so descent / cut compares like with like (ticket 434). */
const COLUMN_CELLS = 20
/** L1 takes about 13 s of game ticks a bore; room for a loaded box. */
const CUT_TIMEOUT_MS = 120_000

function cellsPerSecondOf(rung: DrillLadderRung): number {
  return (rung.cells * TICKS_PER_SECOND) / rung.ticks
}

/** How far a rung's felt descent sits off the VS's L20 target, as a share of it. */
function offFeltTargetShareOf(rung: DrillLadderRung): number {
  const descent = descentMetresPerSecondOf(cellsPerSecondOf(rung))
  return descent / L20_FELT_DESCENT.metresPerSecond - 1
}

function cutLadder(): DrillLadderRung[] {
  return STEPS.map((step) => cutColumnAtDrillStep(step, COLUMN_CELLS))
}

describe('the cells to m/s mapping on the 1.2 m bore (ticket 663)', () => {
  let shipped: DrillLadderRung[] = []
  let wide: DrillLadderRung[] = []

  beforeAll(() => {
    shipped = cutLadder()
    wide = withDrillSideClearance(WIDE_BORE_CLEARANCE_MM, cutLadder)
  }, CUT_TIMEOUT_MS)

  it("cuts band 1 in the same ticks as #36's 1.9 m bore at L1, L10 and L20", () => {
    expect(shipped).toEqual(wide)
  })

  it("takes L20 down at the VS's 83.9 m/s, within 2.7% under and 0.5% over", () => {
    const offShare = offFeltTargetShareOf(shipped[STEPS.indexOf(20)])
    expect(offShare).toBeGreaterThanOrEqual(-L20_FELT_DESCENT.belowShare)
    expect(offShare).toBeLessThanOrEqual(L20_FELT_DESCENT.aboveShare)
  })
})
