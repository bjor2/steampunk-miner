/**
 * A planet's generated ore pool, counted off generation (ticket 644, the GD lock of R3 option (a)
 * on #644): the ore cells, their value V_p = the sum of each ore cell's base sale price, and per
 * band the solid non-core cells beside the ore in them. It reads the seed and the version only,
 * never a bot run, so one seed and build always count the same pool. Base price is the list price
 * a unit of the cell's ore sells at (`oreSalePrice` of its sale tier, a signature one tier up),
 * before any assay lift; a cell mines one unit.
 */
import { resourceTierOf } from '../systems/authority/minedOre'
import { oreSalePrice } from '../systems/economy/oreEconomy'
import { add, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../systems/money'
import { oreTypeOf, saleTierOf } from '../systems/registries/oreTypes'
import { generateChunkCells } from '../systems/world/generateChunk'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { PlanetParams } from '../systems/world/planetParams'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
} from '../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, isSolidCell, kindOfCell } from '../systems/world/worldCell'

/** Bands 1 to 5 hold ore (#6 section 1). */
export const ORE_BANDS = [1, 2, 3, 4, 5] as const

/** One band's cells: ore cells by the tier they sell at, beside the solid non-core cells. */
interface BandCount {
  solidCells: number
  oreCellsBySaleTier: Map<number, number>
}

/** The counts a census folds chunk by chunk; `censusOfCounts` prices them once at the end. */
export interface OreCount {
  planet: number
  radiusTiles: number
  bands: BandCount[]
}

export interface BandOreCensus {
  band: number
  solidCells: number
  oreCells: number
  oreValue: Money
}

export interface PlanetOreCensus {
  planet: number
  radiusTiles: number
  oreCells: number
  oreValue: Money
  bands: BandOreCensus[]
}

/** Every chunk of the disc, generated and counted. */
export function censusOfPlanet(params: PlanetParams): PlanetOreCensus {
  const count = emptyOreCount(params)
  countDiscChunks(count, params)
  return censusOfCounts(count)
}

export function emptyOreCount(params: PlanetParams): OreCount {
  return {
    planet: params.planetIndex,
    radiusTiles: params.radiusTiles,
    bands: ORE_BANDS.map(() => ({ solidCells: 0, oreCellsBySaleTier: new Map() })),
  }
}

function countDiscChunks(count: OreCount, params: PlanetParams): void {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      countChunkOre(count, params, cx, cy, generateChunkCells(params, cx, cy))
    }
  }
}

/** One chunk's cells folded into the count: space, air and the core count nowhere. */
export function countChunkOre(
  count: OreCount,
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
): void {
  for (let index = 0; index < CHUNK_CELLS; index++) {
    const cell = cells[index]
    if (!isBandCell(cell)) continue
    const tx = firstTileOfChunk(cx) + (index % CHUNK_SIZE)
    const ty = firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE)
    countBandCell(count.bands[bandOfTile(params, tx, ty) - 1], params, cell)
  }
}

function isBandCell(cell: number): boolean {
  return isSolidCell(cell) && kindOfCell(cell) !== CELL_KIND.core
}

function countBandCell(band: BandCount | undefined, params: PlanetParams, cell: number): void {
  if (band === undefined) return
  band.solidCells++
  if (kindOfCell(cell) !== CELL_KIND.ore) return
  const saleTier = saleTierOfCell(params, cell)
  band.oreCellsBySaleTier.set(saleTier, (band.oreCellsBySaleTier.get(saleTier) ?? 0) + 1)
}

function saleTierOfCell(params: PlanetParams, cell: number): number {
  return saleTierOf(
    oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) }),
  )
}

export function censusOfCounts(count: OreCount): PlanetOreCensus {
  const bands = count.bands.map((band, at) => bandCensusOf(ORE_BANDS[at], band))
  return {
    planet: count.planet,
    radiusTiles: count.radiusTiles,
    oreCells: bands.reduce((sum, band) => sum + band.oreCells, 0),
    oreValue: bands.reduce((sum, band) => add(sum, band.oreValue), ZERO_MONEY),
    bands,
  }
}

function bandCensusOf(band: number, count: BandCount): BandOreCensus {
  const tiers = [...count.oreCellsBySaleTier]
  return {
    band,
    solidCells: count.solidCells,
    oreCells: tiers.reduce((sum, [, cells]) => sum + cells, 0),
    oreValue: tiers.reduce(
      (sum, [tier, cells]) => add(sum, mul(oreSalePrice(tier), fromSafeInteger(cells))),
      ZERO_MONEY,
    ),
  }
}
