import { describe, expect, it } from 'vitest'
import { MAX_DRAWN_GROUND_BLOCKS, VIEW_SHORT_AXIS_MAX_M } from '../../constants/scene'
import { planetParamsFor } from '../world/planetParams'
import { chunkOfTile } from '../world/tileGrid'
import { currentDensityOfChunk, EMPTY_WORLD, materialCellsOfChunk } from '../world/worldState'
import { buildChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'
import {
  BLOCKS_PER_CHUNK,
  copyShownBlocks,
  drawnBlockCountOf,
  shownChunksOf,
  visibleGroundBlocksAround,
  type TileInstances,
} from './groundBlocks'
import { viewRadiusOf } from './visibleChunks'
import { pixelsPerMetreOf } from './viewZoom'

const params = planetParamsFor(1, 1)
const radiusTiles = params.radiusTiles

function viewRadiusAt(width: number, height: number, viewShortAxisMetres: number): number {
  return viewRadiusOf(width, height, pixelsPerMetreOf(width, height, viewShortAxisMetres))
}

function mostBlocksAcrossPlanet(viewRadius: number): number {
  let most = 0
  for (let y = -radiusTiles; y <= radiusTiles; y += 3.7) {
    for (let x = -radiusTiles; x <= radiusTiles; x += 3.7) {
      most = Math.max(most, visibleGroundBlocksAround({ x, y }, viewRadius, radiusTiles).length)
    }
  }
  return most
}

/** The chunk at the planet's surface straight up from the centre, built as the renderer does. */
function surfaceChunkBatch() {
  const cx = 0
  const cy = chunkOfTile(radiusTiles - 4)
  const halo = chunkDensityHaloOf(
    (x, y) => currentDensityOfChunk(EMPTY_WORLD, params, x, y),
    cx,
    cy,
  )
  const cells = materialCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  return buildChunkTileBatch(params, cx, cy, cells, halo)
}

function emptyInstances(): TileInstances {
  return {
    count: 0,
    tiles: new Float32Array(1024 * 2),
    baseColours: new Float32Array(1024 * 3),
    oreColours: new Float32Array(1024 * 4),
    styles: new Float32Array(1024 * 4),
  }
}

describe('ground blocks', () => {
  it('never draws more than 48 blocks at the 20 m zoom-out on a 4K screen, anywhere on the planet (#38)', () => {
    const radius = viewRadiusAt(3840, 2160, VIEW_SHORT_AXIS_MAX_M)
    expect(mostBlocksAcrossPlanet(radius)).toBeLessThanOrEqual(MAX_DRAWN_GROUND_BLOCKS)
  })

  it('draws the same blocks at 1080p and 4K for the same zoom (#38 acceptance 1)', () => {
    const centre = { x: -150.5, y: 120.25 }
    const at1080p = viewRadiusAt(1920, 1080, VIEW_SHORT_AXIS_MAX_M)
    const at4k = viewRadiusAt(3840, 2160, VIEW_SHORT_AXIS_MAX_M)
    expect(visibleGroundBlocksAround(centre, at4k, radiusTiles)).toEqual(
      visibleGroundBlocksAround(centre, at1080p, radiusTiles),
    )
  })

  it('covers every point the screen can show at any rotation', () => {
    const centre = { x: 33.2, y: 290.5 }
    const radius = viewRadiusAt(1920, 1080, VIEW_SHORT_AXIS_MAX_M)
    const blocks = visibleGroundBlocksAround(centre, radius, radiusTiles)
    for (let step = 0; step < 64; step++) {
      const angle = (step / 64) * 2 * Math.PI
      const x = centre.x + Math.cos(angle) * radius * 0.999
      const y = centre.y + Math.sin(angle) * radius * 0.999
      if (Math.hypot(x, y) > radiusTiles) continue
      expect(blocks).toContainEqual({ column: Math.floor(x / 8), row: Math.floor(y / 8) })
    }
  })

  it('groups the blocks by chunk, one bit per block counted from the bottom-left', () => {
    const shown = shownChunksOf([
      { column: 0, row: 0 },
      { column: 3, row: 3 },
      { column: -1, row: 4 },
    ])
    expect(shown).toEqual([
      { cx: 0, cy: 0, blockMask: 1 | (1 << 15) },
      { cx: -1, cy: 1, blockMask: 1 << 3 },
    ])
  })

  it('lays out a chunk block by block, so each block is one run of its tiles', () => {
    const batch = surfaceChunkBatch()
    expect(batch.blockStarts[BLOCKS_PER_CHUNK]).toBe(batch.count)
    for (let block = 0; block < BLOCKS_PER_CHUNK; block++) {
      for (let at = batch.blockStarts[block]; at < batch.blockStarts[block + 1]; at++) {
        const [lx, ly] = [batch.tiles[at * 2], batch.tiles[at * 2 + 1]]
        expect(Math.floor(ly / 8) * 4 + Math.floor(lx / 8)).toBe(block)
      }
    }
  })

  it('draws only the tiles of the shown blocks, and counts only blocks that hold ground', () => {
    const batch = surfaceChunkBatch()
    const drawn = emptyInstances()
    const allBlocks = (1 << BLOCKS_PER_CHUNK) - 1
    copyShownBlocks(batch, allBlocks, drawn)
    expect(drawn.count).toBe(batch.count)
    const oneBlock = [...Array(BLOCKS_PER_CHUNK).keys()].find(
      (block) => batch.blockStarts[block + 1] > batch.blockStarts[block],
    ) as number
    copyShownBlocks(batch, 1 << oneBlock, drawn)
    expect(drawn.count).toBe(batch.blockStarts[oneBlock + 1] - batch.blockStarts[oneBlock])
    expect(drawnBlockCountOf(batch, 1 << oneBlock)).toBe(1)
    expect(drawnBlockCountOf(batch, 0)).toBe(0)
  })
})
