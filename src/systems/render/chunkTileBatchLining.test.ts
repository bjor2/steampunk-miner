import { describe, expect, it } from 'vitest'
import { casingRingAround, lineRing } from '../world/casingLining'
import { clearDisc } from '../world/groundEdit'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk, type TilePoint } from '../world/tileGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
  type WorldState,
} from '../world/worldState'
import { casingGradeLookOf } from './casingGradeLook'
import { casingLookOfBits, NO_CASING_LOOK } from './casingLookBits'
import { isLinedBits } from './cellGateBits'
import { buildChunkTileBatch, TILE_STYLE, type ChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'
import { liningCellsOf } from './liningCells'

// The casing lining rides the gate channel's lined bit (ticket 315, #309 GD decision 3): set
// from the chunk's casing layer, so no provider is registered here.

const params = planetParamsFor(83921, 8)
const REFRACTORY = 1
const CENTRE = { xMm: 20500, yMm: 500500 }
const WALL: TilePoint = { tx: 20, ty: 501 }

function batchOf(world: WorldState, tile: TilePoint): ChunkTileBatch {
  const [cx, cy] = [chunkOfTile(tile.tx), chunkOfTile(tile.ty)]
  const halo = chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
  const cells = materialCellsOfChunk(world, params, cx, cy)
  const lining = liningCellsOf(currentCasingOfChunk(world, cx, cy))
  return buildChunkTileBatch(params, cx, cy, cells, halo, lining)
}

/** The drawn tile's gate bits and style, or null where no tile is drawn. */
function drawnAt(world: WorldState, tile: TilePoint): { bits: number; style: number } | null {
  const batch = batchOf(world, tile)
  const lx = tile.tx - firstTileOfChunk(chunkOfTile(tile.tx))
  const ly = tile.ty - firstTileOfChunk(chunkOfTile(tile.ty))
  for (let at = 0; at < batch.count; at++) {
    if (batch.tiles[at * 2] === lx && batch.tiles[at * 2 + 1] === ly) {
      return { bits: batch.gates[at], style: batch.styles[at * 4] }
    }
  }
  return null
}

function linedBore(typeIndex?: number): WorldState {
  const hole = clearDisc(
    EMPTY_WORLD,
    params,
    { ...CENTRE, radiusMm: 950, floorRadiusMm: null },
    255,
  )
  const ring = casingRingAround(CENTRE.xMm, CENTRE.yMm)
  return lineRing(hole.world, params, ring, 3, typeIndex).world
}

describe('casing lining in the chunk mesh (ticket 315)', () => {
  it("sets the lined bit on a standard ring's wall cell", () => {
    const drawn = drawnAt(linedBore(), WALL)
    expect(drawn?.style).toBe(TILE_STYLE.ground)
    expect(isLinedBits(drawn?.bits ?? 0)).toBe(true)
  })

  it('leaves a refractory wall to its firebrick and sets no lined bit', () => {
    expect(isLinedBits(drawnAt(linedBore(REFRACTORY), WALL)?.bits ?? 0)).toBe(false)
  })

  it('sets no lined bit on a bore with no lining', () => {
    const hole = clearDisc(
      EMPTY_WORLD,
      params,
      { ...CENTRE, radiusMm: 950, floorRadiusMm: null },
      255,
    )
    expect(isLinedBits(drawnAt(hole.world, WALL)?.bits ?? 0)).toBe(false)
  })

  it('marks no cell of a chunk with no lining', () => {
    const { standard, refractory } = liningCellsOf(currentCasingOfChunk(EMPTY_WORLD, 0, 15))
    expect([...standard, ...refractory].every((mark) => mark === 0)).toBe(true)
    expect(standard).toHaveLength(CHUNK_SIZE * CHUNK_SIZE)
  })
})

describe('casing grade looks in the chunk mesh (ticket 830)', () => {
  const drawnLookAt = (world: WorldState, tile: TilePoint) => {
    const batch = batchOf(world, tile)
    const lx = tile.tx - firstTileOfChunk(chunkOfTile(tile.tx))
    const ly = tile.ty - firstTileOfChunk(chunkOfTile(tile.ty))
    for (let at = 0; at < batch.count; at++) {
      if (batch.tiles[at * 2] === lx && batch.tiles[at * 2 + 1] === ly) {
        return casingLookOfBits(batch.casings[at])
      }
    }
    return null
  }

  it("carries a grade-3 standard ring's plate, finish and type in the wall cell's casing slot", () => {
    const look = casingGradeLookOf(3)
    expect(drawnLookAt(linedBore(), WALL)).toEqual({
      plateIndex: look.plateIndex,
      finishIndex: look.finishIndex,
      drawnPips: 0,
      typeIndex: 0,
    })
    expect(look.plate.id).toBe('iron')
  })

  it("carries a refractory ring's lining type beside its grade, so the trim draws over the plate", () => {
    expect(drawnLookAt(linedBore(REFRACTORY), WALL)).toMatchObject({
      plateIndex: casingGradeLookOf(3).plateIndex,
      typeIndex: REFRACTORY,
    })
  })

  it('shows a relined cell at its highest grade, the newest lining over the history', () => {
    const relined = lineRing(linedBore(), params, casingRingAround(CENTRE.xMm, CENTRE.yMm), 5).world
    expect(drawnLookAt(relined, WALL)?.plateIndex).toBe(casingGradeLookOf(5).plateIndex)
  })

  it('leaves the casing slot at 0 on a bore with no lining and on every cell of an unlined chunk', () => {
    const hole = clearDisc(
      EMPTY_WORLD,
      params,
      { ...CENTRE, radiusMm: 950, floorRadiusMm: null },
      255,
    )
    expect(drawnLookAt(hole.world, WALL)).toBeNull()
    const { look } = liningCellsOf(currentCasingOfChunk(EMPTY_WORLD, 0, 15))
    expect(look.every((value) => value === NO_CASING_LOOK)).toBe(true)
  })
})
