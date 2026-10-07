import { describe, expect, it } from 'vitest'
import {
  carriedSizesOf,
  chargesThatFitOf,
  doChargesFit,
  freeRackSlotsOf,
  NO_CHARGES,
  rackSlotsUsedOf,
  totalCarriedOf,
  withCarried,
} from './vehicleCharges'

/** A bolted-on rack of 3 slots with one size-1 charge and none of any other size. */
const ONE_SMALL = withCarried({ ...NO_CHARGES, isRackMounted: true }, 1, 1)

describe('the charge rack by size (K8 #218)', () => {
  it('counts the slots its charges fill: one a size-1 charge, two a size-4', () => {
    const rack = withCarried(ONE_SMALL, 4, 1)
    expect(rackSlotsUsedOf(rack)).toBe(3)
    expect(freeRackSlotsOf(rack)).toBe(0)
    expect(totalCarriedOf(rack)).toBe(2)
  })

  it('fits charges only into whole free slots', () => {
    expect(chargesThatFitOf(ONE_SMALL, 4)).toBe(1)
    expect(doChargesFit(ONE_SMALL, 4, 1)).toBe(true)
    expect(doChargesFit(ONE_SMALL, 4, 2)).toBe(false)
    expect(chargesThatFitOf(ONE_SMALL, 6)).toBe(0)
  })

  it('keeps no key for a size it no longer holds, so equal racks are equal', () => {
    const emptied = withCarried(ONE_SMALL, 1, 0)
    expect(emptied.carriedBySize).toEqual({})
    expect(emptied).toEqual({ ...NO_CHARGES, isRackMounted: true })
  })

  it('lists the sizes it holds smallest first, whatever order they came in', () => {
    const rack = withCarried(withCarried(ONE_SMALL, 5, 1), 2, 1)
    expect(carriedSizesOf(rack)).toEqual([1, 2, 5])
    expect(JSON.stringify(rack.carriedBySize)).toBe('{"1":1,"2":1,"5":1}')
  })
})
