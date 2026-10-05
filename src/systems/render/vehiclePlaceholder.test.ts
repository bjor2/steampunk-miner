import { describe, expect, it } from 'vitest'
import { vehiclePartsForTier } from './vehiclePlaceholder'

const idsOf = (tier: number) => vehiclePartsForTier(tier).map((part) => part.id)

describe('vehicle placeholder', () => {
  it.each([2, 3])('keeps every part of the tier below at visual tier %i and adds more', (tier) => {
    const below = idsOf(tier - 1)
    expect(idsOf(tier)).toEqual(expect.arrayContaining(below))
    expect(idsOf(tier).length).toBeGreaterThan(below.length)
  })

  it('draws lower layers first, so the chassis sits over its wheels', () => {
    const ids = idsOf(1)
    expect(ids.indexOf('chassis')).toBeGreaterThan(ids.indexOf('wheel_mid'))
  })
})
