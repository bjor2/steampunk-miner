import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { chargePlacementOf, scorchesAfter } from './chargePlacement'

const blastAt = (tx: number, ty: number): DomainEvent => ({
  type: 'ChargeDetonated',
  tick: 0,
  tx,
  ty,
  size: 1,
  radiusMm: 2500,
  by: 'fuse',
})

describe('charge placement (#109 visibility)', () => {
  it('stands a charge on its tile centre with its up pointing away from the planet', () => {
    const placement = chargePlacementOf({ tx: -1, ty: 280 })
    expect(placement).toMatchObject({ x: -0.5, y: 280.5 })
    expect(placement.turn).toBeCloseTo(Math.atan2(280.5, -0.5) - Math.PI / 2)
  })

  it('scorches each blast, keeps the last 16 and clears them on a new planet', () => {
    const blasts = Array.from({ length: 18 }, (_, at) => blastAt(at, 200))
    const kept = scorchesAfter([], blasts)
    expect(kept).toHaveLength(16)
    expect(kept[0].x).toBe(2.5)
    const arrived = scorchesAfter(kept, [
      { type: 'PlanetEntered', tick: 0, planetSeed: 1, generatorVersion: 4, radius: 300 },
    ])
    expect(arrived).toEqual([])
  })
})
