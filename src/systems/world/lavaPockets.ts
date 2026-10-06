/**
 * Lava pockets of a heat planet (spec #113, the `hazardPocketVolume` of the heat archetype): plain
 * ground is cut into `LAVA_POCKET_TILES` square blocks, and a block is a pocket with its band's
 * volume as the chance, drawn from the block's own hash, so the planet is the same in any chunk
 * order. A pocket paints only plain ground of its own band: ore, the core, caves and the placed
 * features (the pad, the starter vein, the cache) keep their cells. Band 1 has volume 0, so the
 * pad's band is safe.
 */
import { LAVA_POCKET_TILES } from '../../constants/balance'
import { hashCell } from '../cellRandom'
import { hazardPocketVolume } from '../economy/heatEconomy'
import { fromSafeInteger, mul, toSafeInteger, floor } from '../money'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import type { PlanetParams } from './planetParams'
import { bandOfTile } from './planetGeometry'
import { CHUNK_SIZE, firstTileOfChunk } from './tileGrid'
import { GROUND_CELL, LAVA_CELL } from './worldCell'

const CHANCE_SCALE = 10000
const BANDS = [1, 2, 3, 4, 5]
/** The block's middle tile, whose band decides the block. */
const MIDDLE = Math.floor(LAVA_POCKET_TILES / 2)

/** Paints the chunk's lava pockets over its plain ground; nothing off the heat planets. */
export function paintLavaPockets(params: PlanetParams, cells: Uint32Array, cx: number, cy: number) {
  const chances = pocketChancesOf(params)
  if (chances.every((chance) => chance === 0)) return
  const seed = subSeedFor(params, SEED_PURPOSE.lavaPocket)
  const firstTx = firstTileOfChunk(cx)
  const firstTy = firstTileOfChunk(cy)
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const index = ly * CHUNK_SIZE + lx
      const tile = { tx: firstTx + lx, ty: firstTy + ly }
      if (cells[index] === GROUND_CELL && isPocketBlock(params, seed, chances, tile)) {
        cells[index] = LAVA_CELL
      }
    }
  }
}

/** Each band's pocket chance in ten-thousandths, rounded down. */
function pocketChancesOf(params: PlanetParams): number[] {
  return BANDS.map((band) =>
    toSafeInteger(
      floor(mul(hazardPocketVolume(params.planetIndex, band), fromSafeInteger(CHANCE_SCALE))),
    ),
  )
}

/**
 * The block a tile is in is a pocket (its hash under its middle tile's band chance), and the tile
 * is in that band: a block across a band edge is clipped to its own band, as ore patches are, so
 * band 1 never holds lava.
 */
function isPocketBlock(
  params: PlanetParams,
  seed: number,
  chances: readonly number[],
  tile: { tx: number; ty: number },
): boolean {
  const bx = Math.floor(tile.tx / LAVA_POCKET_TILES)
  const by = Math.floor(tile.ty / LAVA_POCKET_TILES)
  const band = bandOfTile(params, bx * LAVA_POCKET_TILES + MIDDLE, by * LAVA_POCKET_TILES + MIDDLE)
  if (bandOfTile(params, tile.tx, tile.ty) !== band) return false
  return hashCell(seed, bx, by) % CHANCE_SCALE < chances[band - 1]
}
