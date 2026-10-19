import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { engineStatsAtStep } from '../economy/vehicleStats'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { speedOfStepBound, stepBoundsOf } from './stepBound'
import { travelSpeedOf } from './travelParity'
import { FACING } from './vehiclePose'
import { newVehicleState, type VehicleState } from './vehicleState'

// Ticket 553 (Systems' Proposal 1 on #551, with the VS and the GD's ordering): the engine has no
// max level, so the travel speed it buys must stay inside the stats' step bound at every purchase
// up to 200, the rig never outrunning what the authority accepts. Rows at 18, 27, 57, 100 and
// 240 m/s: the old flag-off clamp, the tunnelling threshold, the capsule fallback and #560's rows.

const PARAMS = planetParamsFor(83921, 1)
const SURFACE_Y = (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 1) * 1000 + 450
const PURCHASES_0_TO_200 = Array.from({ length: 201 }, (_, purchase) => purchase)
const TRAVEL_ROWS_M_PER_S = [18, 27, 57, 100, 240]

/** A starting rig standing on the surface of planet 1 with `engine` engine purchases. */
function rigWithEngine(engine: number): VehicleState {
  const fresh = newVehicleState(null, 0)
  const pose = { x: 20_500, y: SURFACE_Y, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.down }
  return { ...fresh, pose, levels: { ...fresh.levels, engine } }
}

/** The first engine purchase whose top speed reaches `speed` m/s. */
function firstPurchaseReaching(speed: number): number {
  const purchase = PURCHASES_0_TO_200.find((at) => engineStatsAtStep(at).speedMax >= speed)
  if (purchase === undefined) throw new Error(`no engine purchase up to 200 reaches ${speed} m/s`)
  return purchase
}

function travelMmPerTickOf(rig: VehicleState): number {
  return (travelSpeedOf(rig, PARAMS) * MM_PER_METRE) / TICKS_PER_SECOND
}

describe('engine travel inside the step bound (ticket 553)', () => {
  it('keeps the travel speed within the travel bound at every engine purchase from 0 to 200', () => {
    for (const purchase of PURCHASES_0_TO_200) {
      const rig = rigWithEngine(purchase)
      expect(travelMmPerTickOf(rig)).toBeLessThanOrEqual(stepBoundsOf(rig, PARAMS).travellingMm)
    }
  })

  it.each(TRAVEL_ROWS_M_PER_S)(
    'lets a rig travelling at %d m/s move at its full speed',
    (speed) => {
      const rig = rigWithEngine(firstPurchaseReaching(speed))
      const bound = speedOfStepBound(stepBoundsOf(rig, PARAMS).travellingMm)
      expect(travelSpeedOf(rig, PARAMS)).toBeGreaterThanOrEqual(speed)
      expect(bound).toBeGreaterThanOrEqual(travelSpeedOf(rig, PARAMS))
    },
  )

  it('reaches the 240 m/s row well inside 200 purchases', () => {
    expect(firstPurchaseReaching(240)).toBeLessThan(200)
  })
})
