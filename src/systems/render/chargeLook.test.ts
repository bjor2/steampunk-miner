import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import type { DomainEvent } from '../authority/domainEvent'
import {
  chargePlacementOf,
  chargeRackQuadsOf,
  fuseLampQuadsOf,
  isFuseLampLit,
  plantedChargeBodyQuadsOf,
  scorchesAfter,
} from './chargeLook'

const partsOf = (rackCharges: number | null) =>
  chargeRackQuadsOf(SHIPPED_ART, rackCharges).map((quad) => quad.partId)

const blastAt = (tx: number, ty: number): DomainEvent => ({
  type: 'ChargeDetonated',
  tick: 0,
  tx,
  ty,
  tilesCleared: 21,
  oreValueLost: '0',
  collapseChecks: 0,
  collapsesTriggered: 0,
})

describe('charge look (#109 visibility, art #110)', () => {
  it('draws no rack until it is bolted on', () => {
    expect(partsOf(null)).toEqual([])
  })

  it('shows exactly the charges carried on the rack', () => {
    expect(partsOf(0)).toEqual(['charge-rack'])
    expect([...partsOf(3)].sort()).toEqual(['charge-1', 'charge-2', 'charge-3', 'charge-rack'])
    expect(partsOf(8)).toHaveLength(9)
  })

  it('splits the planted charge into its body and the lamp that blinks', () => {
    expect(plantedChargeBodyQuadsOf(SHIPPED_ART).map((quad) => quad.partId)).toEqual([
      'prop-blasting-charge',
    ])
    expect(fuseLampQuadsOf(SHIPPED_ART).map((quad) => quad.partId)).toEqual(['fuse-lamp'])
  })

  it('blinks the lamp about four times a second, and faster in the last second', () => {
    expect([0, 0.3, 0.55].map((seconds) => isFuseLampLit(seconds, 100))).toEqual([
      true,
      false,
      true,
    ])
    expect([0, 0.15, 0.25].map((seconds) => isFuseLampLit(seconds, 60))).toEqual([
      true,
      false,
      true,
    ])
  })

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
