import { describe, expect, it } from 'vitest'
import {
  DRILL_QUANTUM_MAX_DOUBLINGS,
  DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL,
  DRILL_SUBSTEPS_PER_TICK,
} from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import { toFixedText } from '../money'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { RADIUS_BASE_TILES, RADIUS_GROWTH_TILES } from '../world/planetTable'
import { cutCellsPerSecondOf } from './cutSpeed'
import { drillQuantumOnPlanet, subStepsInQuantum } from './drillQuantum'
import { subStepsPerTile, subStepsPerTileAt } from './drillRule'

// Ticket 558 (#551 B1): the swept cut's quantum doubles for a rig whose band-1 cells would cost
// fewer than 100 sub-steps, so the rounding of a cell's time stays under 1% at any speed, and a
// rig that already paid 100 or more keeps the base 60 and cuts as before.

const PLANET = 1
const SOFT_GROUND = blockHardness(PLANET, 1)

function drillAt(purchase: number) {
  return vehicleStatsAt({ ...startLevels(), drill_power: purchase })
}

function softCellSubStepsAt(purchase: number): number {
  const drill = drillAt(purchase)
  return subStepsPerTileAt(drillQuantumOnPlanet(drill, PLANET), drill, SOFT_GROUND) as number
}

describe('the drill quantum (ticket 558)', () => {
  it('keeps the base 60 for a rig whose band-1 cell already costs 100 sub-steps', () => {
    for (const purchase of [0, 1, 12, 15]) {
      const drill = drillAt(purchase)
      expect(subStepsPerTile(drill, SOFT_GROUND)).toBeGreaterThanOrEqual(100)
      expect(drillQuantumOnPlanet(drill, PLANET)).toBe(DRILL_SUBSTEPS_PER_TICK)
    }
  })

  it('doubles the base until a band-1 cell costs 100 to 199 sub-steps', () => {
    for (let purchase = 16; purchase <= 50; purchase++) {
      const quantum = drillQuantumOnPlanet(drillAt(purchase), PLANET)
      expect(quantum % DRILL_SUBSTEPS_PER_TICK).toBe(0)
      expect(softCellSubStepsAt(purchase)).toBeGreaterThanOrEqual(
        DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL,
      )
      expect(softCellSubStepsAt(purchase)).toBeLessThan(2 * DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL)
    }
  })

  it('stops doubling at 122,880 sub-steps a tick, whatever the drill', () => {
    const top = DRILL_SUBSTEPS_PER_TICK * 2 ** DRILL_QUANTUM_MAX_DOUBLINGS
    expect(top).toBe(122_880)
    expect(drillQuantumOnPlanet(drillAt(300), PLANET)).toBe(top)
    expect(drillQuantumOnPlanet(drillAt(3000), PLANET)).toBe(top)
  })

  it('still pays 100 sub-steps a band-1 cell at the largest planet clamp, 1,000 m a tick', () => {
    const top = DRILL_SUBSTEPS_PER_TICK * 2 ** DRILL_QUANTUM_MAX_DOUBLINGS
    const largestRadiusTiles = RADIUS_BASE_TILES + RADIUS_GROWTH_TILES
    expect(top / largestRadiusTiles).toBeGreaterThanOrEqual(DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL)
  })

  it('cuts within 1% of the law from 1000 cells/s up to the top quantum', () => {
    for (let purchase = 31; purchase <= 50; purchase++) {
      const law = Number(toFixedText(drillAt(purchase).drillPower, 6))
      const delivered = cutCellsPerSecondOf(
        softCellSubStepsAt(purchase),
        drillQuantumOnPlanet(drillAt(purchase), PLANET),
      )
      expect(law).toBeGreaterThan(1000)
      expect(delivered / law).toBeGreaterThan(0.99)
      expect(delivered).toBeLessThanOrEqual(law)
    }
  })

  it('rescales carried sub-steps exactly into a larger quantum and down into a smaller one', () => {
    expect(subStepsInQuantum(37, 60, 240)).toBe(148)
    expect(subStepsInQuantum(148, 240, 60)).toBe(37)
    expect(subStepsInQuantum(150, 240, 60)).toBe(37)
    expect(subStepsInQuantum(37, 60, 60)).toBe(37)
  })
})
