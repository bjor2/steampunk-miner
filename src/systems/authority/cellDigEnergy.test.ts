import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { CellDrillTicks } from '../world/groundEdit'
import { CELL_KIND, packCell, RESOURCE_FAMILY } from '../world/worldCell'
import { cellDigEnergyOf, sweptCutEnergyOf } from './cellDigEnergy'
import { withoutGear } from './drillGearCut'

// The swept cut's energy (ticket 335, the TD lock on #374): exactly per cell, weighted by each
// cell's own drill time, never by the tick or the tick's summed dig time.

const TICK = DRILL_SUBSTEPS_PER_TICK
const DRILL_QUANTA = ENERGY_QUANTA_PER_TICK.drill

/** A carve that broke `cells`, each `{tx, ty}`, with lining samples cleared at `grade`. */
function carveBreaking(cells: { tx: number; ty: number }[], lining = { samples: 0, grade: 0 }) {
  return withoutGear({
    world: { chunks: {} },
    changes: [],
    yielded: cells.map((tile) => ({
      tile,
      cell: packCell(CELL_KIND.ground, RESOURCE_FAMILY.none, 0),
    })),
    ticksUsed: 1,
    casingCleared: lining,
  })
}

/** Cell times: a cell's tx in whole ticks; lining of grade g takes g ticks a cell. */
const timesByColumn: CellDrillTicks = (tile, _material, grade) =>
  grade === 0 ? tile.tx * TICK : grade * TICK

describe('cell dig energy (ticket 335)', () => {
  it('costs a cell its drill time at the drill rate, rounded up once to a quantum', () => {
    expect(cellDigEnergyOf(24 * TICK)).toBe(24 * DRILL_QUANTA)
    expect(cellDigEnergyOf(1)).toBe(1)
    expect(cellDigEnergyOf(TICK / 2, 20_000)).toBe(DRILL_QUANTA)
  })

  it('sums each broken cell at its own time, however many a tick breaks', () => {
    const carve = carveBreaking([
      { tx: 2, ty: 0 },
      { tx: 5, ty: 0 },
    ])
    expect(sweptCutEnergyOf(carve, timesByColumn, 1_000_000)).toBe(7 * DRILL_QUANTA)
  })

  it('prices lining it cleared as the cells its samples make up', () => {
    const carve = carveBreaking([], { samples: 32, grade: 3 })
    expect(sweptCutEnergyOf(carve, timesByColumn, 1_000_000)).toBe(2 * 3 * DRILL_QUANTA)
  })

  it('never charges more than the tank holds', () => {
    const carve = carveBreaking([{ tx: 50, ty: 0 }])
    expect(sweptCutEnergyOf(carve, timesByColumn, 7)).toBe(7)
  })
})
