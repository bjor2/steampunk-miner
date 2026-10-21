import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'

// The Vertical Scaler's width bars on #308 (ticket 620), at a fixed drill level: width never lowers
// descent, so time to core is the same at every width, because the side cells cut on their own
// clocks beside the bore and never take the bore's work; and they are charged their own energy,
// so a wider row costs more (per cell at its share: `drillGearCut.test.ts`). The level-0 drill
// on a body pushing down sets the pace; the pacing-bot reading of the same bars (time to core
// within 1%, tank ratio at width 5) is the Tester's.

const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const START = { x: COLUMN * 1000 + 500, y: (SURFACE_TY - 1) * 1000 + 500 }
/** The level-0 drill takes about 40 ticks a band-1 cell, so it sets the descent's pace. */
const PUSH_MM_PER_TICK = 100
const TICKS = 240
const WIDTHS = [0, 1, 2, 3]
/** The bore column's rows the descent reaches, from the start down. */
const BORE_ROWS = Array.from(
  { length: (PUSH_MM_PER_TICK * TICKS) / 1000 },
  (_, row) => SURFACE_TY - 1 - row,
)

function sideCellsSlice(sideCells: number): SliceDefinition {
  return {
    id: 'width-probe',
    register: (r) => r.drillGear({ id: 'width-probe.sides', gearOf: () => ({ sideCells }) }),
  }
}

/** A drill-paced descent with `sideCells` a side: where its cut reached, and what it cost. */
function descend(sideCells: number) {
  return withRegistrations([sideCellsSlice(sideCells)], () => {
    const session = createScriptedSession()
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
    let spent = 0
    let opened = 0
    for (let tick = 1; tick <= TICKS; tick++) {
      session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
      const before = session.vehicle().energy
      const y = START.y - PUSH_MM_PER_TICK * tick
      const step = { x: START.x, y, facing: FACING.down, drive: NO_DRIVE }
      const events = session.submit(tick, { type: 'drillStep', payload: step })
      spent += before - session.vehicle().energy
      opened += events.filter((event) => event.type === 'TileDestroyed').length
    }
    const world = session.state().world
    const boreColumn = BORE_ROWS.map((ty) => cellDensitySum(world, PARAMS, { tx: COLUMN, ty }))
    return { boreColumn, spent, opened }
  })
}

describe('drill width bars (VS on #308, ticket 620)', () => {
  const runs = WIDTHS.map(descend)
  const [bare] = runs

  it('cuts the bore column to the same densities at every width: width never takes its work', () => {
    expect(bare.boreColumn.filter((density) => density === 0).length).toBeGreaterThan(5)
    expect(runs.map((run) => run.boreColumn)).toEqual(WIDTHS.map(() => bare.boreColumn))
  })

  it('opens more cells and pays more energy with side cells than the bare bore', () => {
    for (const run of runs.slice(1)) {
      expect(run.opened).toBeGreaterThan(bare.opened)
    }
    const spent = runs.map((run) => run.spent)
    expect(spent).toEqual([...spent].sort((a, b) => a - b))
    expect(new Set(spent).size).toBe(WIDTHS.length)
  })
})
