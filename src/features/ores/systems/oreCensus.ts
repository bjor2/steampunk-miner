/**
 * A planet's ore cells counted off generation (#146 pre-close, GD 7 Oct): the lead cells the rarity
 * lead made, how many of those a gate holds (rig or dynamite, #142), and the signature cells (#141).
 * The counts come from the generated chunks, not a bot run, so they move only with the mix wiring.
 * Halving the lead weights moves the lead counts and never the signature count.
 */
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { oreTypeOf, type OreType } from '../../../systems/registries/oreTypes'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { PlanetParams } from '../../../systems/world/planetParams'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from '../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../systems/world/worldCell'
import { leadOfCell } from './leadRoll'

export interface OreCensus {
  oreCells: number
  plus1Cells: number
  plus2Cells: number
  /** Lead cells a gate check has a verdict on. */
  gatedLeadCells: number
  signatureCells: number
}

export interface ChunkPoint {
  cx: number
  cy: number
}

/** Whether a gate holds an ore cell; the caller asks the gate registry with a state of its own. */
export type IsGatedCell = (tile: TilePoint, cell: number, ore: OreType) => boolean

/** Every chunk holding a tile of the planet's disc. */
export function chunksOfPlanet(params: PlanetParams): ChunkPoint[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const span = Array.from({ length: max - min + 1 }, (_, at) => min + at)
  return span.flatMap((cy) => span.map((cx) => ({ cx, cy })))
}

/** The census of the given chunks, generated under the registrations in force. */
export function oreCensusOf(
  params: PlanetParams,
  chunks: readonly ChunkPoint[],
  isGated: IsGatedCell,
): OreCensus {
  const census = { oreCells: 0, plus1Cells: 0, plus2Cells: 0, gatedLeadCells: 0, signatureCells: 0 }
  for (const chunk of chunks) countOreOfChunk(census, params, chunk, isGated)
  return census
}

function countOreOfChunk(
  census: OreCensus,
  params: PlanetParams,
  { cx, cy }: ChunkPoint,
  isGated: IsGatedCell,
): void {
  const cells = generateChunkCells(params, cx, cy)
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (kindOfCell(cells[index]) !== CELL_KIND.ore) continue
    const tile = tileOfCellIndex(cx, cy, index)
    countOreCell(census, params, tile, cells[index], isGated)
  }
}

function countOreCell(
  census: OreCensus,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
  isGated: IsGatedCell,
): void {
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const lead = leadOfCell(params, tile, cell)
  census.oreCells++
  if (lead === 1) census.plus1Cells++
  if (lead === 2) census.plus2Cells++
  if (lead > 0 && isGated(tile, cell, ore)) census.gatedLeadCells++
  if (ore.signature === true) census.signatureCells++
}

function tileOfCellIndex(cx: number, cy: number, index: number): TilePoint {
  return {
    tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
    ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
  }
}
