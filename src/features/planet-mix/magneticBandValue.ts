/**
 * What a planet's ore is worth per band, generated (`balance:magnetic-planet`, GD lock on spec #258
 * Q7, ticket 294): every ore cell of the disc at the price it sells for, its `saleTier` through the
 * kernel curve, summed per band. The lock keeps a magnetic planet's ferrous and induction cells
 * value-neutral, so each band stays within #141's +4% of the same planet with the class off. Read
 * under the registrations in force. Only specs use it.
 */
import { minedOreOf } from '../../systems/authority/minedOre'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { add, ZERO_MONEY, type Money } from '../../systems/money'
import { generateChunkCells } from '../../systems/world/generateChunk'
import { bandOfTile, BAND_COUNT } from '../../systems/world/planetGeometry'
import type { PlanetParams } from '../../systems/world/planetParams'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
} from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'

/** The sale value of every ore cell on the planet, band 1 first. */
export function bandOreValuesOf(params: PlanetParams): Money[] {
  const values: Money[] = Array.from({ length: BAND_COUNT }, () => ZERO_MONEY)
  for (const [cx, cy] of chunksOfDisc(params)) addChunkOreValues(params, values, cx, cy)
  return values
}

function chunksOfDisc(params: PlanetParams): [number, number][] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const span = Array.from({ length: max - min + 1 }, (_, at) => min + at)
  return span.flatMap((cy) => span.map((cx): [number, number] => [cx, cy]))
}

function addChunkOreValues(params: PlanetParams, values: Money[], cx: number, cy: number): void {
  const cells = generateChunkCells(params, cx, cy)
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (kindOfCell(cells[index]) !== CELL_KIND.ore) continue
    const tile = {
      tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
      ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
    }
    const band = bandOfTile(params, tile.tx, tile.ty)
    const price = oreSalePrice(minedOreOf(params, tile, cells[index]).saleTier)
    values[band - 1] = add(values[band - 1], price)
  }
}
