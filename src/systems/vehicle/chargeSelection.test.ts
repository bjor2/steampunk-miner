import { describe, expect, it } from 'vitest'
import { chargeSizeToPlantOf, nextChargeSizeOf } from './chargeSelection'
import { NO_CHARGES, withCarried, type VehicleCharges } from './vehicleCharges'

function rackOf(carried: Record<number, number>): VehicleCharges {
  const mounted: VehicleCharges = { ...NO_CHARGES, isRackMounted: true, slotLevel: 5 }
  return Object.entries(carried).reduce<VehicleCharges>(
    (rack, [size, count]) => withCarried(rack, Number(size), count),
    mounted,
  )
}

describe('charge size choice (#153 next_charge_size, K8 #218)', () => {
  it('plants the chosen size while the rack holds one', () => {
    expect(chargeSizeToPlantOf(rackOf({ 1: 2, 4: 1 }), 4)).toBe(4)
  })

  it('plants the smallest size the rack holds once the chosen one runs out', () => {
    expect(chargeSizeToPlantOf(rackOf({ 2: 1, 4: 1 }), 3)).toBe(2)
  })

  it('steps to the next size the rack holds, wrapping round to the smallest', () => {
    const rack = rackOf({ 1: 1, 4: 1, 6: 1 })
    expect(nextChargeSizeOf(rack, 1)).toBe(4)
    expect(nextChargeSizeOf(rack, 4)).toBe(6)
    expect(nextChargeSizeOf(rack, 6)).toBe(1)
  })

  it('has nothing to step to with fewer than two sizes in the rack', () => {
    expect(nextChargeSizeOf(rackOf({ 1: 3 }), 1)).toBeNull()
    expect(nextChargeSizeOf(NO_CHARGES, 1)).toBeNull()
  })
})
