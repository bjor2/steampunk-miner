import { describe, expect, it } from 'vitest'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { drillHeadLookOf, VEHICLE_PARTS, vehicleShapesForTier } from './vehiclePlaceholder'

const keysOf = (tier: number) => vehicleShapesForTier(tier).map((shape) => shape.key)
const shapesOfPart = (tier: number, partId: string) =>
  vehicleShapesForTier(tier).filter((shape) => shape.key.startsWith(`${partId}.`))

describe('vehicle visual tiers', () => {
  it('gives every layered part 3 variants, picked by the summed-level tier by default', () => {
    expect(VEHICLE_PARTS.length).toBeGreaterThanOrEqual(8)
    VEHICLE_PARTS.forEach((part) => {
      expect(part.variants).toHaveLength(3)
      expect(part.tierSource).toBe('total')
    })
  })

  it.each([2, 3])('shows more on the vehicle at visual tier %i than the tier below', (tier) => {
    expect(keysOf(tier).length).toBeGreaterThan(keysOf(tier - 1).length)
  })

  it('adds side armour and a second stack at tier 2, a second boiler and lamp at tier 3', () => {
    expect(shapesOfPart(1, 'armour')).toHaveLength(0)
    expect(shapesOfPart(2, 'armour').length).toBeGreaterThanOrEqual(2)
    expect(shapesOfPart(2, 'stacks')).toHaveLength(2)
    expect(shapesOfPart(3, 'boiler').filter((shape) => shape.colour === '#c9a24b')).toHaveLength(2)
    expect(shapesOfPart(3, 'lamp')).toHaveLength(2)
  })

  it('fits the bore collar on the drill head only at tier 3', () => {
    expect(drillHeadLookOf(1).collarSize).toBe(0)
    expect(drillHeadLookOf(2).collarSize).toBe(0)
    expect(drillHeadLookOf(3).collarSize).toBeGreaterThan(0)
  })

  it('draws tiers past 3 as tier 3, the last variant', () => {
    expect(keysOf(7)).toEqual(keysOf(3))
  })

  it('draws lower layers first, so the chassis sits over its wheels', () => {
    const layers = vehicleShapesForTier(1).map((shape) => shape.layer)
    expect(layers).toEqual([...layers].sort((a, b) => a - b))
  })

  it('leaves the collider at most 0.9 m square, whatever the art overhangs', () => {
    expect(VEHICLE_COLLIDER_SIZE).toBeLessThanOrEqual(0.9)
  })
})
