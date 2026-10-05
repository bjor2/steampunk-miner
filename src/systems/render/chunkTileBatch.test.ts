import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  isSolidCell,
  kindOfCell,
  RESOURCE_FAMILY,
} from '../world/worldCell'
import {
  cellAt,
  currentCellsOfChunk,
  EMPTY_WORLD,
  withTileRemoved,
  type WorldState,
} from '../world/worldState'
import { chunkViewVersionOf, isSameChunkView } from './chunkViewVersion'
import {
  buildChunkTileBatch,
  EDGE,
  SILHOUETTE_CODE,
  TILE_STYLE,
  type ChunkTileBatch,
} from './chunkTileBatch'

const params = planetParamsFor(83921, 1)

function batchOf(world: WorldState, cx: number, cy: number): ChunkTileBatch {
  return buildChunkTileBatch(params, cx, cy, currentCellsOfChunk(world, params, cx, cy), (tx, ty) =>
    cellAt(world, params, { tx, ty }),
  )
}

/** The instance index of a tile in its chunk's batch, or -1 when it draws nothing. */
function instanceOf(batch: ChunkTileBatch, tx: number, ty: number): number {
  const lx = tx - firstTileOfChunk(chunkOfTile(tx))
  const ly = ty - firstTileOfChunk(chunkOfTile(ty))
  for (let at = 0; at < batch.count; at++) {
    if (batch.tiles[at * 2] === lx && batch.tiles[at * 2 + 1] === ly) return at
  }
  return -1
}

function styleAt(world: WorldState, tx: number, ty: number): number[] {
  const batch = batchOf(world, chunkOfTile(tx), chunkOfTile(ty))
  const at = instanceOf(batch, tx, ty)
  return [...batch.styles.subarray(at * 4, at * 4 + 4)]
}

// Band 1 straddles the border between chunk -10 and chunk -9 on the planet's left side at row 0.
const WEST_OF_BORDER = { tx: -289, ty: 0 }
const EAST_OF_BORDER = { tx: -288, ty: 0 }

describe('chunk tile batch', () => {
  it('draws one instance per solid tile and nothing for air or space', () => {
    const cells = currentCellsOfChunk(EMPTY_WORLD, params, 0, 9)
    const solid = [...cells].filter(isSolidCell).length
    expect(batchOf(EMPTY_WORLD, 0, 9).count).toBe(solid)
    expect(solid).toBeLessThan(CHUNK_SIZE * CHUNK_SIZE)
  })

  it('drops a removed tile from its chunk', () => {
    const before = batchOf(EMPTY_WORLD, -10, 0).count
    const dug = withTileRemoved(EMPTY_WORLD, WEST_OF_BORDER)
    expect(batchOf(dug, -10, 0).count).toBe(before - 1)
    expect(instanceOf(batchOf(dug, -10, 0), WEST_OF_BORDER.tx, WEST_OF_BORDER.ty)).toBe(-1)
  })

  it('highlights the side a tile shares with a hole dug across the chunk border', () => {
    expect(styleAt(EMPTY_WORLD, EAST_OF_BORDER.tx, EAST_OF_BORDER.ty)[1]).toBe(0)
    const dug = withTileRemoved(EMPTY_WORLD, WEST_OF_BORDER)
    expect(styleAt(dug, EAST_OF_BORDER.tx, EAST_OF_BORDER.ty)[1]).toBe(EDGE.left)
  })

  it('marks a new version for a chunk whose neighbour lost a border tile', () => {
    const dug = withTileRemoved(EMPTY_WORLD, WEST_OF_BORDER)
    expect(
      isSameChunkView(chunkViewVersionOf(EMPTY_WORLD, -9, 0), chunkViewVersionOf(dug, -9, 0)),
    ).toBe(false)
    expect(
      isSameChunkView(chunkViewVersionOf(EMPTY_WORLD, 3, 3), chunkViewVersionOf(dug, 3, 3)),
    ).toBe(true)
  })

  it('lights the top edge of the surface tile', () => {
    const site = dockSiteOf(params)
    expect(styleAt(EMPTY_WORLD, 0, site.padRow)[1] & EDGE.up).toBe(EDGE.up)
  })

  it('draws ore with its family silhouette and a glow', () => {
    const cells = currentCellsOfChunk(EMPTY_WORLD, params, -9, 0)
    const index = cells.findIndex((cell) => kindOfCell(cell) === CELL_KIND.ore)
    const family = familyOfCell(cells[index])
    const batch = batchOf(EMPTY_WORLD, -9, 0)
    const at = instanceOf(batch, -288 + (index % CHUNK_SIZE), Math.floor(index / CHUNK_SIZE))
    const [style, , silhouette, sparkles] = batch.styles.subarray(at * 4, at * 4 + 4)
    expect(style).toBe(TILE_STYLE.ore)
    expect(silhouette).toBe(
      family === RESOURCE_FAMILY.metal ? SILHOUETTE_CODE.flecks : SILHOUETTE_CODE.shards,
    )
    expect(batch.oreColours[at * 4 + 3]).toBeGreaterThan(0)
    expect(sparkles).toBeGreaterThanOrEqual(1)
  })

  it('draws the core and the dock pad in their own styles', () => {
    expect(styleAt(EMPTY_WORLD, 0, 0)[0]).toBe(TILE_STYLE.core)
    expect(styleAt(EMPTY_WORLD, 0, dockSiteOf(params).padRow)[0]).toBe(TILE_STYLE.pad)
  })
})
