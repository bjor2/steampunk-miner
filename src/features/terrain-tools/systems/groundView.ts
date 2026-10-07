/**
 * How a terrain tool reads the ground while it plans its edit (#162 section 3): the world as it
 * stands, plus the cells the plan has already opened or moved, so a later step never moves ore
 * into a tile an earlier step filled. The rules every tool shares live here:
 *
 * - a gated ore cell and a core cell are fixed: no tool clears, moves, drains or frees one (#162
 *   section 3.3). The gate is asked as the K6 queue asks it, with the edit's `source` as the tool,
 *   so the plan and the queue agree on which cells stand;
 * - a cell within 1 m of any vehicle is a fixed anchor (`vehicleAnchors.ts`);
 * - a lined cell is casing: no tool opens, fills or drags through it (#162 row "casing cells");
 * - ore only ever moves onto plain ground where no gate would hold it, so a drag never turns a
 *   common nodule into a gated one across a band edge, and never makes or loses ore.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { gateVerdictOf, type GateVerdict } from '../../../systems/registries/gateChecks'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import type { IntegerVector } from '../../../systems/vehicle/vehiclePose'
import { isCellLined } from '../../../systems/world/casingLining'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { AIR_CELL, CELL_KIND, familyOfCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, materialCellAt } from '../../../systems/world/worldState'
import type { GateBlock } from '../../power-up-core'
import { isAnchoredByAnyVehicle, vehicleCentresOf } from './vehicleAnchors'

/** What a core cell reports as its gate when it stops a tool. */
export const CORE_GATE_KIND = 'core'

export interface GroundView {
  state: AuthorityState
  params: PlanetParams
  playerId: string
  /** `<slice>.<item>`: the tool asking the gates, as the queued edit names it. */
  source: string
  vehicles: readonly IntegerVector[]
  /** Tiles the plan opened. */
  opened: Set<string>
  /** Material cells the plan moved, by tile. */
  moved: Map<string, number>
}

/** The view of the planet the state is on, or null between planets. */
export function openGroundView(
  state: AuthorityState,
  playerId: string,
  source: string,
): GroundView | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  return {
    state,
    params,
    playerId,
    source,
    vehicles: vehicleCentresOf(state),
    opened: new Set(),
    moved: new Map(),
  }
}

/**
 * The tile's cell as the plan leaves it: air once opened, its moved material once moved. A tile
 * with no density left reads as air too: a K6 density edit opens a tile without yielding it.
 */
export function cellNow(view: GroundView, tile: TilePoint): number {
  if (view.opened.has(keyOf(tile))) return AIR_CELL
  const cell = cellAt(view.state.world, view.params, tile)
  if (kindOfCell(cell) === CELL_KIND.air || isEmptied(view, tile)) return AIR_CELL
  return view.moved.get(keyOf(tile)) ?? cell
}

/** The tile's material as the plan leaves it, open or not: what a swap writes elsewhere. */
export function materialNow(view: GroundView, tile: TilePoint): number {
  return view.moved.get(keyOf(tile)) ?? materialCellAt(view.state.world, view.params, tile)
}

export function kindNow(view: GroundView, tile: TilePoint): number {
  return kindOfCell(cellNow(view, tile))
}

/** The gate or core that holds the cell against every tool; null for any other cell. */
export function fixedBlockOf(view: GroundView, tile: TilePoint): GateBlock | null {
  const cell = cellNow(view, tile)
  const kind = kindOfCell(cell)
  const cellTier = resourceTierOf(view.params, cell)
  if (kind === CELL_KIND.core) return { cellTier, gateKind: CORE_GATE_KIND, ...tile }
  if (kind !== CELL_KIND.ore) return null
  const verdict = toolVerdictOf(view, tile, cell)
  return verdict === null ? null : { cellTier, gateKind: verdict.gateKind, ...tile }
}

export function isAnchored(view: GroundView, tile: TilePoint): boolean {
  return isAnchoredByAnyVehicle(view.vehicles, tile)
}

/** Plain ground a tool may open, fill or drag ore into: no anchor, no casing. */
export function isWorkableGround(view: GroundView, tile: TilePoint): boolean {
  return kindNow(view, tile) === CELL_KIND.ground && isFreeOfAnchorAndCasing(view, tile)
}

/** An ore cell no gate holds against the tool, off every anchor and casing: a tool may move it. */
export function isLooseOre(view: GroundView, tile: TilePoint): boolean {
  if (kindNow(view, tile) !== CELL_KIND.ore || !isFreeOfAnchorAndCasing(view, tile)) return false
  return fixedBlockOf(view, tile) === null
}

/** Whether `oreCell` may come to rest on `tile`: workable ground where no gate would hold it. */
export function canHoldOre(view: GroundView, tile: TilePoint, oreCell: number): boolean {
  return isWorkableGround(view, tile) && toolVerdictOf(view, tile, oreCell) === null
}

export function isOpenAir(view: GroundView, tile: TilePoint): boolean {
  return kindNow(view, tile) === CELL_KIND.air
}

export function markOpened(view: GroundView, tile: TilePoint): void {
  view.opened.add(keyOf(tile))
}

export function markMoved(view: GroundView, tile: TilePoint, material: number): void {
  view.moved.set(keyOf(tile), material)
}

function isEmptied(view: GroundView, tile: TilePoint): boolean {
  return cellDensitySum(view.state.world, view.params, tile) === 0
}

function isFreeOfAnchorAndCasing(view: GroundView, tile: TilePoint): boolean {
  return !isAnchored(view, tile) && !isCellLined(view.state.world, view.params, tile)
}

/**
 * The gates' verdict on `cell` standing at `tile`, asked as the K6 queue asks it; null when the
 * tool may change it (no verdict, or one that cuts it for this tool).
 */
function toolVerdictOf(view: GroundView, tile: TilePoint, cell: number): GateVerdict | null {
  const { state, playerId, params, source } = view
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const verdict = gateVerdictOf({ state, playerId, tile, cell, ore, blast: null, tool: source })
  return verdict === null || verdict.outcome === 'cut' ? null : verdict
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
