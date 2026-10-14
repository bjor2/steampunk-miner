import { describe, expect, it } from 'vitest'
import { dockSiteOf, isDockClearanceTile } from '../world/dockSite'
import { generateChunkCells } from '../world/generateChunk'
import { carveCell } from '../world/groundEdit'
import { planetParamsFor } from '../world/planetParams'
import { swapTileCells } from '../world/terrainCellEdits'
import { CHUNK_SIZE, cellIndexOfTile, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, GROUND_CELL, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { isHollowPocketCell } from './hollowPocket'

const params = planetParamsFor(83921, 3)
const site = dockSiteOf(params)

/** The first tile straight down the dock column whose generated cell is of `kind`. */
function firstGeneratedTileDown(kind: number): TilePoint {
  for (let ty = site.padRow - 1; ty > -params.radiusTiles; ty--) {
    const tile = { tx: 0, ty }
    if (kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === kind) return tile
  }
  throw new Error(`no generated cell of kind ${kind} down the dock column`)
}

/**
 * A planet whose pad (#170) is wide enough that the clearance above its middle lies inside the
 * disc; the shipped pads sit on the top row, so their clearance is all space. Its own seed keeps
 * it apart from `params` in the world's per-planet chunk cache.
 */
const widePadParams = { ...planetParamsFor(27182, 3), padFirstColumn: -60, padLastColumn: 60 }

/** Every tile of a strip of chunks down the dock column, with its freshly generated cell. */
function generatedTilesDown(): { tile: TilePoint; cell: number }[] {
  const tiles: { tile: TilePoint; cell: number }[] = []
  for (let cy = 1; cy >= -3; cy--) {
    const cells = generateChunkCells(params, 0, cy)
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tile = { tx: lx, ty: cy * CHUNK_SIZE + ly }
        tiles.push({ tile, cell: cells[cellIndexOfTile(tile.tx, tile.ty)] })
      }
    }
  }
  return tiles
}

function isExpectedPocket(tile: TilePoint, cell: number): boolean {
  const isAir = kindOfCell(cell) === CELL_KIND.air
  return isAir && !isDockClearanceTile(site, tile.tx, tile.ty)
}

describe('hollow pocket cells', () => {
  it('reads a cave generation hollowed out as a hollow pocket', () => {
    const cave = firstGeneratedTileDown(CELL_KIND.air)

    expect(isHollowPocketCell(EMPTY_WORLD, params, cave)).toBe(true)
  })

  it('reads solid generated ground as no pocket', () => {
    const ground = firstGeneratedTileDown(CELL_KIND.ground)

    expect(isHollowPocketCell(EMPTY_WORLD, params, ground)).toBe(false)
  })

  it('reads a tunnel opened through generated ground as open but no pocket', () => {
    const ground = firstGeneratedTileDown(CELL_KIND.ground)
    const { world } = carveCell(
      EMPTY_WORLD,
      params,
      ground,
      { firstTick: 0, ticks: 1000 },
      () => 24,
    )

    expect(kindOfCell(cellAt(world, params, ground))).toBe(CELL_KIND.air)
    expect(isHollowPocketCell(world, params, ground)).toBe(false)
  })

  it('reads a cave cell swapped back to rock as no pocket', () => {
    const cave = firstGeneratedTileDown(CELL_KIND.air)
    const { world } = swapTileCells(EMPTY_WORLD, [{ ...cave, cell: GROUND_CELL }])

    expect(isHollowPocketCell(world, params, cave)).toBe(false)
  })

  it('reads the air cleared above the dock pad as no pocket', () => {
    const clearance = { tx: 0, ty: dockSiteOf(widePadParams).padRow + 1 }

    expect(kindOfCell(cellAt(EMPTY_WORLD, widePadParams, clearance))).toBe(CELL_KIND.air)
    expect(isHollowPocketCell(EMPTY_WORLD, widePadParams, clearance)).toBe(false)
  })

  it('reads space outside the disc as no pocket', () => {
    const space = { tx: 0, ty: params.radiusTiles + 4 }

    expect(isHollowPocketCell(EMPTY_WORLD, params, space)).toBe(false)
  })

  it('matches the generated cells of every tile down the dock column', () => {
    const tiles = generatedTilesDown()
    const pockets = tiles.filter(({ tile, cell }) => isExpectedPocket(tile, cell))

    expect(pockets.length).toBeGreaterThan(0)
    for (const { tile, cell } of tiles) {
      expect(isHollowPocketCell(EMPTY_WORLD, params, tile)).toBe(isExpectedPocket(tile, cell))
    }
  })
})
