/**
 * Whether a planet's core can be reached past its blast-only rock with the charge types a miner
 * has (D4 #863 CI; the HS rows on #647: gated rock is never the only route to the core, so every
 * core is reachable with type-1 and type-2 charges or by drilling round). The walk is a strip of
 * columns from above the surface straight down to the core, the generated ground before any dig:
 * every tile is passable but core and the gated rock no type held breaks, since every other cell
 * opens to the drill, a charge or an extractor. A route inside the strip is a route on the planet,
 * so the check is sufficient and reads only the strip's chunks.
 */
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { doesTypeBreakGate } from '../../../systems/economy/chargeSizes'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { cellIndexOfTile, chunkOfTile, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellGateOf } from './cellGates'

/** The charge types a miner holds, by number. */
export type HeldTypes = readonly number[]

/** The strip's columns either side of the planet's north axis. */
const STRIP_HALF_WIDTH = 8
const STEPS: readonly TilePoint[] = [
  { tx: 1, ty: 0 },
  { tx: -1, ty: 0 },
  { tx: 0, ty: 1 },
  { tx: 0, ty: -1 },
]

/** A tile's material cell. */
export type CellReader = (tile: TilePoint) => number

/** Whether a walk from above the surface down the strip of the generated planet reaches its core. */
export function isCoreReachableWith(params: PlanetParams, held: HeldTypes): boolean {
  return isCoreReachableIn(params, generatedCellReader(params), held)
}

/** The same over the cells `cellAt` reads: the spec seam for a planet walled in on purpose. */
export function isCoreReachableIn(
  params: PlanetParams,
  cellAt: CellReader,
  held: HeldTypes,
): boolean {
  const isPassable = (tile: TilePoint) => isPassableTile(params, cellAt(tile), tile, held)
  return walksToCore(params, cellAt, isPassable)
}

/** The generated cell of a tile, each chunk generated once. */
export function generatedCellReader(params: PlanetParams): CellReader {
  const chunks = new Map<string, Uint32Array>()
  return (tile) => {
    const cx = chunkOfTile(tile.tx)
    const cy = chunkOfTile(tile.ty)
    const key = `${cx},${cy}`
    const cells = chunks.get(key) ?? generateChunkCells(params, cx, cy)
    chunks.set(key, cells)
    return cells[cellIndexOfTile(tile.tx, tile.ty)]
  }
}

/** The strip's columns, west to east. */
export function stripColumns(): number[] {
  return Array.from({ length: 2 * STRIP_HALF_WIDTH + 1 }, (_, at) => at - STRIP_HALF_WIDTH)
}

/** Breadth first from the strip's top row, never above it or outside its columns. */
function walksToCore(
  params: PlanetParams,
  cellAt: CellReader,
  isPassable: (tile: TilePoint) => boolean,
): boolean {
  const top = params.radiusTiles + 1
  const queue: TilePoint[] = stripColumns().map((tx) => ({ tx, ty: top }))
  const seen = new Set(queue.map(keyOf))
  for (let at = 0; at < queue.length; at++) {
    for (const next of neighboursOf(queue[at], top)) {
      if (seen.has(keyOf(next))) continue
      seen.add(keyOf(next))
      if (kindOfCell(cellAt(next)) === CELL_KIND.core) return true
      if (isPassable(next)) queue.push(next)
    }
  }
  return false
}

/** Ground a miner holding `held` opens: anything but core and gated rock no held type breaks. */
function isPassableTile(params: PlanetParams, cell: number, tile: TilePoint, held: HeldTypes) {
  if (kindOfCell(cell) !== CELL_KIND.ore) return kindOfCell(cell) !== CELL_KIND.core
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const gate = cellGateOf(params, tile, ore)
  return gate.kind !== 'dynamite' || held.some((type) => doesTypeBreakGate(type, gate.tier))
}

function neighboursOf(tile: TilePoint, top: number): TilePoint[] {
  return STEPS.map((step) => ({ tx: tile.tx + step.tx, ty: tile.ty + step.ty })).filter(
    (next) => Math.abs(next.tx) <= STRIP_HALF_WIDTH && next.ty <= top,
  )
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
