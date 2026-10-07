import { afterEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { PartMotionRequest } from '../systems/registries/partMotionRequests'
import { vehiclePartIdsOf, vehiclePartPosesOf } from '../systems/render/vehicleLook'
import { FACING, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { partMotion, stepVehicleParts } from './partMotionPresence'
import { SHIPPED_ART } from './shippedArt'

// The `partMotionRequests` seam (K-b ticket 227, #180 showcase reactions): a fake slice asks for
// a pose and a swap, and the presence, still the one writer, shows both on the drawn car.

const PARKED: VehiclePose = { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1000, facing: FACING.right }
const IDLE = { isDriving: false, isThrusting: false, isDrilling: false }

const TWIST: PartMotionRequest = {
  kind: 'pose',
  attach: 'chassis.drive',
  slots: ['piston'],
  x: 0.02,
  y: 0,
  angle: 0.3,
  glow: 0.4,
}
const BIG_DRILL: PartMotionRequest = {
  kind: 'swap',
  attach: 'drill.head',
  partIds: ['t3-drill-bit'],
}

const reactingSlice: SliceDefinition = {
  id: 'reaction-probe',
  register: (r) =>
    r.partMotionRequests({ id: 'reaction-probe.reactions', requestsNow: () => [TWIST, BIG_DRILL] }),
}

function stepOnce(slices: readonly SliceDefinition[]): void {
  withRegistrations(slices, () => stepVehicleParts(PARKED, IDLE))
}

afterEach(() => stepOnce([]))

describe('part motion requests', () => {
  it("adds a slice's pose to its part on the next tick, and leaves the other parts alone", () => {
    const before = vehiclePartPosesOf(SHIPPED_ART, partMotion, 1, false)
    stepOnce([reactingSlice])
    const after = vehiclePartPosesOf(SHIPPED_ART, partMotion, 1, false)
    expect(after['t1-piston'].x - before['t1-piston'].x).toBeCloseTo(0.02, 9)
    expect(after['t1-piston'].angle - before['t1-piston'].angle).toBeCloseTo(0.3, 9)
    expect(after['t1-wheel'].x).toBe(before['t1-wheel'].x)
  })

  it('shows only the glow of a requested pose while motion is reduced', () => {
    stepOnce([reactingSlice])
    const reduced = vehiclePartPosesOf(SHIPPED_ART, partMotion, 1, true)
    expect(reduced['t1-piston']).toMatchObject({ x: 0, angle: 0 })
    expect(reduced['t1-piston'].glow).toBeCloseTo(0.4, 9)
  })

  it('draws a swapped-in part in place of the tier-1 one, and names its attach point', () => {
    stepOnce([reactingSlice])
    const shown = vehiclePartIdsOf(SHIPPED_ART, 1, partMotion.requested.shownPartIds)
    expect(shown).toContain('t3-drill-bit')
    expect(shown).not.toContain('t1-drill-bit')
    expect(partMotion.requested.attach).toEqual(['chassis.drive', 'drill.head'])
  })

  it('draws the car exactly as before with no source registered', () => {
    stepOnce([reactingSlice])
    stepOnce([])
    expect(vehiclePartIdsOf(SHIPPED_ART, 1, partMotion.requested.shownPartIds)).toEqual(
      vehiclePartIdsOf(SHIPPED_ART, 1),
    )
    expect(partMotion.requested.attach).toEqual([])
  })
})
