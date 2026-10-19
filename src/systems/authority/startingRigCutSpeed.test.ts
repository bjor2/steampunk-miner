import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { div, fromSafeInteger, mul, toFixedText } from '../money'
import { cutStepMmOf } from '../vehicle/cutSpeed'
import { drillQuantumOnPlanet } from '../vehicle/drillQuantum'
import { subStepsPerTileAt } from '../vehicle/drillRule'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutFollowAt } from './cutFollowRead'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'

// The starting rigs' cut-follow speed per stored drill_power step (ticket 431, the Vertical
// Scaler's ratio question on #430): band-1 rock of planet 1 with the tip at step 0, so `eff` is 1
// and the drill law's speed is `D` cells/s. A stored step is one purchase of x1.243 since the GD
// ruling on #551 (ticket 552). The table and its cause are in docs/economy/drill-ladder.md.
const STORED_STEPS = Array.from({ length: 31 }, (_, step) => step)
/**
 * Purchases whose next one lands in 1.181..1.305 on soft ground (VS on #551, via the TD): every one
 * since ticket 558 counts a fast rig's cell in its own drill quantum (the floor broke it at 24).
 */
const BANDED_PURCHASES = Array.from({ length: 29 }, (_, at) => at + 1)
/** Up to here a cell costs enough sub-steps that the read loses under a mm a tick to them. */
const FINE_READ_STEPS = STORED_STEPS.slice(0, 11)
const PURCHASE_BAND = { lowest: 1.181, highest: 1.305 }
const BAND_1_ROCK = blockHardness(PARAMS.planetIndex, 1)
const COLUMN = 20
const REST = {
  x: COLUMN * 1000 + 500,
  y: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) + 1) * 1000 + 400,
}

function statsAtDrillStep(step: number) {
  return vehicleStatsAt({ ...startLevels(), drill_power: step })
}

/** The cut-follow's read in mm a tick, at a rig of `step` resting on the band-1 surface. */
function readStepMmAt(step: number): number {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: step },
  })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: REST.x, y: REST.y } })
  session.advanceTo(1)
  const drillingStep = { ...REST, facing: FACING.down, isLifting: false, isDrilling: true }
  const { cutSpeed } = cutFollowAt(session.state(), 'p1', drillingStep)
  // The read is whole mm a tick as m/s; rounding undoes the float of that conversion.
  return Math.round((cutSpeed * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** The drill law's exact step in mm a tick, `1000 D eff / (60 H)`, to 6 places. */
function lawStepMmAt(step: number): number {
  const perSecond = div(statsAtDrillStep(step).drillPower, BAND_1_ROCK)
  const perTick = div(
    mul(perSecond, fromSafeInteger(MM_PER_METRE)),
    fromSafeInteger(TICKS_PER_SECOND),
  )
  return Number(toFixedText(perTick, 6))
}

/** The drill quantum of a step on planet 1 (ticket 558), and a band-1 cell's sub-steps in it. */
function cellTimeAt(step: number): { quantum: number; subSteps: number } {
  const drill = statsAtDrillStep(step)
  const quantum = drillQuantumOnPlanet(drill, PARAMS.planetIndex)
  return { quantum, subSteps: subStepsPerTileAt(quantum, drill, BAND_1_ROCK) as number }
}

function cellsPerTickAt(step: number): number {
  const { quantum, subSteps } = cellTimeAt(step)
  return quantum / subSteps
}

/** The next purchase's cut over this one's, from their cells' sub-steps: the gain the cut is paid at. */
function purchaseGainOfSubSteps(fromStep: number): number {
  return cellsPerTickAt(fromStep + 1) / cellsPerTickAt(fromStep)
}

describe('starting rigs cut speed (ticket 431)', () => {
  it("keeps the drill law's first purchase at its old pip, 1.0063, before the read rounds to mm", () => {
    expect(purchaseGainOfSubSteps(0)).toBeCloseTo(1.0063, 3)
  })

  it('pays every purchase from 1 to 30 a gain of 1.181 to 1.305 in the sub-steps a cell costs', () => {
    const outside = BANDED_PURCHASES.filter((step) => {
      const gain = purchaseGainOfSubSteps(step)
      return gain < PURCHASE_BAND.lowest || gain > PURCHASE_BAND.highest
    })
    expect(outside).toEqual([])
  })

  it('reads the cell its whole sub-steps allow, never over the law, at every stored step to 30', () => {
    for (const step of STORED_STEPS) {
      const read = readStepMmAt(step)
      const { quantum, subSteps } = cellTimeAt(step)
      expect(read).toBe(cutStepMmOf(subSteps, quantum))
      expect(lawStepMmAt(step) - read).toBeGreaterThanOrEqual(0)
    }
  })

  it("reads the drill law's speed to within one mm a tick under it on the rigs to stored 10", () => {
    for (const step of FINE_READ_STEPS) {
      expect(lawStepMmAt(step) - readStepMmAt(step)).toBeLessThanOrEqual(1)
    }
  })
})
