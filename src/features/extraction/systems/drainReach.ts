/**
 * What the mineral drain finds around the miner (#162 extractors table, 4.2): every tile within
 * its radius, nearest first, sorted into the ore cells it may drain and the ones it must skip. It
 * skips a rig-gated or dynamite-gated cell (`canMine` asked with the drain as the tool, #142), a
 * cell too hard for the drill to scratch, and the core; ground, air and lava are not ore and
 * count for nothing. A skipped cell is what blocks the use when nothing is left to drain.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { gateOfTile, type GateAsker } from '../../../systems/authority/cellGates'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import { minedOreOf, resourceTierOf, type MinedOre } from '../../../systems/authority/minedOre'
import { oreCellHardness, scratchFloorOfCell } from '../../../systems/authority/signatureCells'
import { coreMaterialTier } from '../../../systems/economy/oreEconomy'
import { canScratch, type DrillStats } from '../../../systems/vehicle/drillRule'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import type { GateBlock } from '../../power-up-core'

/** An ore cell the drain may take, with the ore a unit of it would be. */
export interface DrainableCell {
  tile: TilePoint
  ore: MinedOre
}

/** The cells in reach: what may be drained and what was skipped, each nearest first. */
export interface DrainReach {
  drainable: readonly DrainableCell[]
  skipped: readonly GateBlock[]
}

/** Who drains, from where, as which tool. */
export interface DrainAsker {
  state: AuthorityState
  params: PlanetParams
  playerId: string
  /** The terrain edit's `source`, the tool `canMine` is asked for. */
  tool: string
  origin: TilePoint
  reachTiles: number
}

type ReadCell = { drainable: DrainableCell } | { skipped: GateBlock } | null

export function drainReachOf(asker: DrainAsker): DrainReach {
  const gates: GateAsker = { ...asker, blast: null }
  const drill = heatThrottledDrill(asker.params.planetIndex, vehicleOf(asker.state, asker.playerId))
  const read = tilesInReachOf(asker.origin, asker.reachTiles).map((tile) =>
    readCellAt(gates, drill, tile),
  )
  return { drainable: read.flatMap(drainableOf), skipped: read.flatMap(skippedOf) }
}

function drainableOf(cell: ReadCell): DrainableCell[] {
  return cell !== null && 'drainable' in cell ? [cell.drainable] : []
}

function skippedOf(cell: ReadCell): GateBlock[] {
  return cell !== null && 'skipped' in cell ? [cell.skipped] : []
}

/**
 * Every tile whose centre lies within `reachTiles` of the origin's, nearest first; ties go to the
 * upper row, then the left column, so the order is the same on every machine.
 */
export function tilesInReachOf(origin: TilePoint, reachTiles: number): TilePoint[] {
  const offsets: { dx: number; dy: number; distanceSq: number }[] = []
  for (let dy = -reachTiles; dy <= reachTiles; dy++) {
    for (let dx = -reachTiles; dx <= reachTiles; dx++) {
      const distanceSq = dx * dx + dy * dy
      if (distanceSq <= reachTiles * reachTiles) offsets.push({ dx, dy, distanceSq })
    }
  }
  offsets.sort((a, b) => a.distanceSq - b.distanceSq || b.dy - a.dy || a.dx - b.dx)
  return offsets.map(({ dx, dy }) => ({ tx: origin.tx + dx, ty: origin.ty + dy }))
}

function readCellAt(gates: GateAsker, drill: DrillStats, tile: TilePoint): ReadCell {
  const cell = cellAt(gates.state.world, gates.params, tile)
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.core) return { skipped: coreBlockOf(gates.params, tile) }
  if (kind !== CELL_KIND.ore) return null
  const gated = gateOfTile(gates, tile)
  if (gated !== null && gated.verdict.outcome !== 'cut') {
    return { skipped: blockOf(tile, gated.ore.tier, gated.verdict.gateKind) }
  }
  if (!isScratchedBy(drill, gates.params, tile, cell)) {
    return { skipped: blockOf(tile, resourceTierOf(gates.params, cell), 'drill') }
  }
  return { drainable: { tile, ore: minedOreOf(gates.params, tile, cell) } }
}

/** "Too hard for the drill": a cell the tip would only skid on is left, as the drill leaves it. */
function isScratchedBy(drill: DrillStats, params: PlanetParams, tile: TilePoint, cell: number) {
  const hardness = oreCellHardness(params, tile, cell)
  return canScratch(drill.gateTip, hardness, scratchFloorOfCell(params, tile, cell))
}

function coreBlockOf(params: PlanetParams, tile: TilePoint): GateBlock {
  return blockOf(tile, coreMaterialTier(params.planetIndex), 'core')
}

function blockOf({ tx, ty }: TilePoint, cellTier: number, gateKind: string): GateBlock {
  return { cellTier, gateKind, tx, ty }
}
