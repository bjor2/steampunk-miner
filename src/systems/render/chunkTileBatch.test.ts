import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { clearDisc } from '../world/groundEdit'
import { CHUNK_SAMPLE_SIDE, sampleIndexOf } from '../world/sampleGrid'
import { chunkOfTile, firstTileOfChunk } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell, RESOURCE_FAMILY } from '../world/worldCell'
import {
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
  type WorldState,
} from '../world/worldState'
import { chunkViewVersionOf, isSameChunkView } from './chunkViewVersion'
import {
  buildChunkTileBatch,
  SILHOUETTE_CODE,
  TILE_STYLE,
  type ChunkTileBatch,
} from './chunkTileBatch'
import { chunkDensityHaloOf, DENSITY_HALO_SIDE } from './densityHalo'

const params = planetParamsFor(83921, 1)

function haloOf(world: WorldState, cx: number, cy: number): Uint8Array {
  return chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
}

function batchOf(world: WorldState, cx: number, cy: number): ChunkTileBatch {
  const cells = materialCellsOfChunk(world, params, cx, cy)
  return buildChunkTileBatch(params, cx, cy, cells, haloOf(world, cx, cy))
}

/** A hole the drill stamp would leave round a tile's centre: 1.9 m across. */
function holeAt(tile: { tx: number; ty: number }): WorldState {
  const disc = {
    xMm: tile.tx * 1000 + 500,
    yMm: tile.ty * 1000 + 500,
    radiusMm: 950,
    floorRadiusMm: null,
  }
  return clearDisc(EMPTY_WORLD, params, disc, 255).world
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
  it('draws the tiles the surface crosses and nothing out in space', () => {
    const surface = batchOf(EMPTY_WORLD, 0, 9)
    expect(surface.count).toBeGreaterThan(0)
    expect(surface.count).toBeLessThan(32 * 32)
    expect(batchOf(EMPTY_WORLD, 0, 12).count).toBe(0)
  })

  it('drops a tile whose ground the drill cleared, keeping the rim it cut into', () => {
    const before = batchOf(EMPTY_WORLD, -10, 0)
    const dug = batchOf(holeAt(WEST_OF_BORDER), -10, 0)
    expect(instanceOf(before, WEST_OF_BORDER.tx, WEST_OF_BORDER.ty)).not.toBe(-1)
    expect(instanceOf(dug, WEST_OF_BORDER.tx, WEST_OF_BORDER.ty)).toBe(-1)
    expect(instanceOf(dug, WEST_OF_BORDER.tx - 1, WEST_OF_BORDER.ty)).not.toBe(-1)
  })

  it("carries the neighbours' first samples in the density halo, so chunks meet without a seam", () => {
    const dug = holeAt(EAST_OF_BORDER)
    const halo = haloOf(dug, -10, 0)
    const right = currentDensityOfChunk(dug, params, -9, 0)
    for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
      expect(halo[lsy * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE]).toBe(right[sampleIndexOf(0, lsy)])
    }
    expect(halo).not.toEqual(haloOf(EMPTY_WORLD, -10, 0))
  })

  it('marks a new version for a chunk whose right neighbour changed', () => {
    const dug = holeAt(EAST_OF_BORDER)
    expect(
      isSameChunkView(chunkViewVersionOf(EMPTY_WORLD, -10, 0), chunkViewVersionOf(dug, -10, 0)),
    ).toBe(false)
    expect(
      isSameChunkView(chunkViewVersionOf(EMPTY_WORLD, 3, 3), chunkViewVersionOf(dug, 3, 3)),
    ).toBe(true)
  })

  it('draws ore with its family silhouette and a glow', () => {
    const cells = materialCellsOfChunk(EMPTY_WORLD, params, -9, 0)
    const index = cells.findIndex((cell) => kindOfCell(cell) === CELL_KIND.ore)
    const family = familyOfCell(cells[index])
    const batch = batchOf(EMPTY_WORLD, -9, 0)
    const at = instanceOf(batch, -288 + (index % 32), Math.floor(index / 32))
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
