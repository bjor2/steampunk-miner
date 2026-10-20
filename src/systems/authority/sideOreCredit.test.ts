import { describe, expect, it } from 'vitest'
import { newVehicleState, type VehicleState } from '../vehicle/vehicleState'
import type { GearCellShare } from './drillGearCut'
import { creditOreShare, oreSharesOf } from './sideOreCredit'

// The side ore share (#308 Systems' price rows, ticket 620): 600 bp of a unit per side ore cell,
// on an integer carry, so the seventeenth side ore cell in walk order pays one whole unit.

const SIDE_SHARE_BP = 600

/** `cells` side ore cells credited in order: which ones paid, and the vehicle after. */
function creditSideCells(cells: number, vehicle: VehicleState = newVehicleState(null, 0)) {
  const paid: number[] = []
  for (let cell = 1; cell <= cells; cell++) {
    const credit = creditOreShare(vehicle, SIDE_SHARE_BP)
    if (credit.isPaid) paid.push(cell)
    vehicle = credit.vehicle
  }
  return { paid, vehicle }
}

describe('side ore credit', () => {
  it('pays a whole-share cell its unit at once and leaves the carry out', () => {
    const vehicle = newVehicleState(null, 0)
    expect(creditOreShare(vehicle, 10000)).toEqual({ vehicle, isPaid: true })
  })

  it('carries a side cell its 600 bp and pays nothing for it yet', () => {
    const { paid, vehicle } = creditSideCells(1)
    expect(paid).toEqual([])
    expect(vehicle.sideOreCarryBp).toBe(600)
  })

  it('pays one unit on the seventeenth side ore cell and keeps the 200 bp left over', () => {
    const { paid, vehicle } = creditSideCells(17)
    expect(paid).toEqual([17])
    expect(vehicle.sideOreCarryBp).toBe(17 * 600 - 10000)
  })

  it('pays 6 units for every 100 side ore cells, whatever the cells are split into', () => {
    const once = creditSideCells(100)
    const split = creditSideCells(60, creditSideCells(40).vehicle)
    expect(once.paid).toHaveLength(6)
    expect(split.vehicle).toEqual(once.vehicle)
  })

  it('leaves the carry out again once it lands on a whole unit', () => {
    const vehicle = { ...newVehicleState(null, 0), sideOreCarryBp: 9400 }
    const credit = creditOreShare(vehicle, SIDE_SHARE_BP)
    expect(credit.isPaid).toBe(true)
    expect('sideOreCarryBp' in credit.vehicle).toBe(false)
  })

  it("reads a side gear cell at the side share, and an ahead cell or the bit's whole", () => {
    const cells: GearCellShare[] = [
      { tx: 1, ty: 0, shareBp: 10000, kind: 'side' },
      { tx: 0, ty: -1, shareBp: 10000, kind: 'ahead' },
    ]
    const shareOf = oreSharesOf(cells)
    expect(shareOf({ tx: 1, ty: 0 })).toBe(600)
    expect(shareOf({ tx: 0, ty: -1 })).toBe(10000)
    expect(shareOf({ tx: 0, ty: 0 })).toBe(10000)
  })
})
