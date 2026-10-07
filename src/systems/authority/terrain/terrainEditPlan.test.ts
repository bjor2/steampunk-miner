import { describe, expect, it } from 'vitest'
import { planTerrainEditTick } from './terrainEditPlan'
import type { QueuedTerrainEdit, TerrainCellEdit } from './terrainEdits'

const opened = (tx: number, ty: number): TerrainCellEdit => ({
  kind: 'density',
  tx,
  ty,
  density: 0,
})
const swapped = (tx: number, ty: number): TerrainCellEdit => ({ kind: 'swap', tx, ty, cell: 2 })

function editOf(playerId: string, cells: TerrainCellEdit[]): QueuedTerrainEdit {
  return { playerId, source: 'probe.edit', cells }
}

/** A row of `count` cells starting at `tx, ty`, inside chunk 0,0. */
function row(count: number, make: (tx: number, ty: number) => TerrainCellEdit, ty = 4) {
  return Array.from({ length: count }, (_, at) => make(at, ty))
}

/** Runs the queue tick after tick; answers the ticks it took and what each tick applied. */
function drain(queue: QueuedTerrainEdit[]) {
  const ticks: { playerId: string; cells: number }[][] = []
  let left = queue
  while (left.length > 0 && ticks.length < 50) {
    const plan = planTerrainEditTick(left)
    ticks.push(plan.applied.map(({ playerId, cells }) => ({ playerId, cells: cells.length })))
    left = plan.queue
  }
  return ticks
}

describe('terrain edit plan', () => {
  it('applies 32 density cells or 64 swaps in one tick, and no more', () => {
    expect(drain([editOf('p1', row(32, opened))])).toEqual([[{ playerId: 'p1', cells: 32 }]])
    expect(drain([editOf('p1', row(64, swapped, 4).concat())])).toHaveLength(1)
    expect(drain([editOf('p1', [...row(30, opened), ...row(30, opened, 5)])])).toEqual([
      [{ playerId: 'p1', cells: 32 }],
      [{ playerId: 'p1', cells: 28 }],
    ])
  })

  it('carries what is over the budget to later ticks, first in first out', () => {
    const ticks = drain([editOf('p1', row(20, opened)), editOf('p1', row(20, opened, 6))])
    expect(ticks).toEqual([
      [
        { playerId: 'p1', cells: 20 },
        { playerId: 'p1', cells: 12 },
      ],
      [{ playerId: 'p1', cells: 8 }],
    ])
  })

  it('takes turns across players, round-robin from the first in the queue', () => {
    const plan = planTerrainEditTick([
      editOf('p2', row(30, opened)),
      editOf('p1', row(30, opened, 8)),
      editOf('p2', row(4, opened, 12)),
    ])
    expect(plan.applied.map(({ playerId, cells }) => [playerId, cells.length])).toEqual([
      ['p2', 30],
      ['p1', 2],
    ])
    expect(plan.queue.map(({ playerId, cells }) => [playerId, cells.length])).toEqual([
      ['p1', 28],
      ['p2', 4],
    ])
  })

  it('splits a pocket at a 4-chunk corner: the 2 lowest chunk ids this tick, the rest the next', () => {
    const corner: TerrainCellEdit[] = [
      opened(31, 31),
      opened(32, 31),
      opened(31, 32),
      opened(32, 32),
      opened(30, 31),
      opened(33, 32),
    ]
    const first = planTerrainEditTick([editOf('p1', corner)])
    expect(first.applied[0].cells).toEqual([opened(31, 31), opened(30, 31), opened(31, 32)])
    const second = planTerrainEditTick(first.queue)
    expect(second.applied[0].cells).toEqual([opened(32, 31), opened(32, 32), opened(33, 32)])
    expect(second.queue).toEqual([])
  })

  it('leaves an empty queue empty', () => {
    expect(planTerrainEditTick([])).toEqual({ applied: [], queue: [] })
  })
})
