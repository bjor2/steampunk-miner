import { describe, expect, it } from 'vitest'
import { casingRingAround, lineRing } from './casingLining'
import { clearDisc } from './groundEdit'
import { flowLava, isLavaAt, lavaBesideOpenings } from './lavaFlow'
import { planetParamsFor } from './planetParams'
import { bandOfTile } from './planetGeometry'
import type { TilePoint } from './tileGrid'
import { cellAt, EMPTY_WORLD, type WorldState } from './worldState'
import { CELL_KIND, kindOfCell } from './worldCell'

const PARAMS = planetParamsFor(83921, 8)
const REFRACTORY = 1
const STANDARD = 0

/**
 * A lava cell in band 3 straight above the centre whose cell below is plain ground: the pocket's
 * floor, where a hole carved under it opens the pocket.
 */
function pocketFloor(): TilePoint {
  for (let ty = 300; ty > 100; ty--) {
    for (let tx = -40; tx <= 40; tx++) {
      const tile = { tx, ty }
      const below = { tx, ty: ty - 1 }
      if (
        bandOfTile(PARAMS, tx, ty) === 3 &&
        isLavaAt(EMPTY_WORLD, PARAMS, tile) &&
        kindOfCell(cellAt(EMPTY_WORLD, PARAMS, below)) === CELL_KIND.ground &&
        kindOfCell(cellAt(EMPTY_WORLD, PARAMS, { tx, ty: ty - 3 })) === CELL_KIND.ground
      ) {
        return tile
      }
    }
  }
  throw new Error('no lava pocket floor found')
}

const FLOOR = pocketFloor()
/** A 1.9 m hole centred on the cell under the pocket's floor, up against the lava. */
const HOLE = { xMm: FLOOR.tx * 1000 + 500, yMm: (FLOOR.ty - 1) * 1000 + 500 }

/** The hole carved, then lined with one ring of `typeIndex`, the pocket woken. */
function linedHole(typeIndex: number): { world: WorldState; loose: TilePoint[] } {
  const carved = clearDisc(
    EMPTY_WORLD,
    PARAMS,
    { ...HOLE, radiusMm: 950, floorRadiusMm: null },
    255,
  )
  const lined = lineRing(carved.world, PARAMS, casingRingAround(HOLE.xMm, HOLE.yMm), 5, typeIndex)
  const opened = carved.yielded.map(({ tile }) => tile)
  return { world: lined.world, loose: lavaBesideOpenings(lined.world, PARAMS, opened) }
}

/** Runs flow steps until no lava is loose, at most `steps`. */
function flowUntilRest(world: WorldState, loose: TilePoint[], guardTypeIndex: number, steps = 40) {
  let state = { world, loose, blocked: [] as TilePoint[] }
  for (let step = 0; step < steps && state.loose.length > 0; step++) {
    const next = flowLava(state.world, PARAMS, state.loose, { guardTypeIndex, bodies: [] })
    state = { world: next.world, loose: next.loose, blocked: [...state.blocked, ...next.blocked] }
  }
  return state
}

const BELOW_FLOOR = { tx: FLOOR.tx, ty: FLOOR.ty - 1 }

describe('lava flow (#113 numbers acceptance 2)', () => {
  it('wakes the pocket a hole opens beside', () => {
    expect(linedHole(STANDARD).loose).toContainEqual(FLOOR)
  })

  it('passes a standard-lined ring: the lava runs down into the hole', () => {
    const { world, loose } = linedHole(STANDARD)
    const after = flowUntilRest(world, loose, REFRACTORY)
    expect(isLavaAt(after.world, PARAMS, BELOW_FLOOR)).toBe(true)
    expect(after.blocked).toEqual([])
  })

  it('stops at a refractory ring: the hole stays open and the stop is reported', () => {
    const { world, loose } = linedHole(REFRACTORY)
    const after = flowUntilRest(world, loose, REFRACTORY)
    expect(isLavaAt(after.world, PARAMS, BELOW_FLOOR)).toBe(false)
    expect(isLavaAt(after.world, PARAMS, FLOOR)).toBe(true)
    expect(after.blocked).toContainEqual(BELOW_FLOOR)
    expect(after.loose).toEqual([])
  })

  it('keeps the amount of lava: each cell that fills is one the pocket left', () => {
    const { world, loose } = linedHole(STANDARD)
    const count = (state: WorldState) => lavaCellsAround(state).length
    expect(count(flowUntilRest(world, loose, REFRACTORY).world)).toBe(count(world))
  })

  it('never flows into a cell a vehicle body is in', () => {
    const { world, loose } = linedHole(STANDARD)
    const body = { xMm: HOLE.xMm, yMm: HOLE.yMm + 500 }
    const step = flowLava(world, PARAMS, loose, { guardTypeIndex: REFRACTORY, bodies: [body] })
    expect(isLavaAt(step.world, PARAMS, BELOW_FLOOR)).toBe(false)
    expect(step.loose).toContainEqual(FLOOR)
  })
})

function lavaCellsAround(world: WorldState): TilePoint[] {
  const cells: TilePoint[] = []
  for (let ty = FLOOR.ty - 6; ty <= FLOOR.ty + 6; ty++) {
    for (let tx = FLOOR.tx - 6; tx <= FLOOR.tx + 6; tx++) {
      if (isLavaAt(world, PARAMS, { tx, ty })) cells.push({ tx, ty })
    }
  }
  return cells
}
