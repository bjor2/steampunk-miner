import { describe, expect, it } from 'vitest'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import {
  drillHeadQuadsOf,
  drillHeadSizeOf,
  vehicleBodyQuadsOf,
  vehiclePartIdsOf,
} from './vehicleLook'

const idsOf = (quads: { partId: string }[]) => quads.map((quad) => quad.partId)

describe('vehicle look', () => {
  it('shows the inventory parts of #51 on the run vehicle at tier 1', () => {
    expect(vehiclePartIdsOf(1).sort()).toEqual(
      [
        't1-boiler',
        't1-chassis',
        't1-drill-bit',
        't1-drill-head',
        't1-headlamp',
        't1-hopper',
        't1-motor-housing',
        't1-piston',
        't1-stack',
        't1-wheel',
        't1-wheel-2',
        't1-wheel-3',
      ].sort(),
    )
  })

  it('draws the drill head and bit on the swivelling head and everything else on the body', () => {
    expect(idsOf(drillHeadQuadsOf(1)).sort()).toEqual(['t1-drill-bit', 't1-drill-head'])
    expect(idsOf(vehicleBodyQuadsOf(1)).filter((id) => id.includes('drill'))).toEqual([])
  })

  it('centres the drill head’s parts on the head plate, the plate at draw order 0', () => {
    const plate = drillHeadQuadsOf(1).find((quad) => quad.partId === 't1-drill-head')
    expect(plate).toMatchObject({ centre: [0, 0], z: 0 })
  })

  it('fits the bore collar behind the drill head only at tier 3', () => {
    const isCollar = (quad: { size: readonly number[]; z: number }) =>
      quad.z < 0 && quad.size[0] > drillHeadSizeOf(3)
    expect(drillHeadQuadsOf(1).some(isCollar)).toBe(false)
    expect(drillHeadQuadsOf(2).some(isCollar)).toBe(false)
    expect(drillHeadQuadsOf(3).some(isCollar)).toBe(true)
  })

  it('grows the drill head with the tier', () => {
    expect(drillHeadSizeOf(2)).toBeGreaterThan(drillHeadSizeOf(1))
    expect(drillHeadSizeOf(3)).toBeGreaterThan(drillHeadSizeOf(2))
  })

  it('leaves the collider at most 0.9 m square, whatever the art overhangs', () => {
    expect(VEHICLE_COLLIDER_SIZE).toBeLessThanOrEqual(0.9)
  })
})
