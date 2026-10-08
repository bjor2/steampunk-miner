/**
 * How a terrain magnet reads the ground (GD lock on #246, Vertical caps and Gates; ticket 283): which
 * cells a field may move or hold, and which open cells may take one. Every rule of the lock that
 * looks at a single cell lives here; `shiftCellsByMagnet.ts` walks the field with them.
 *
 * A cell the field may move is diggable and loose:
 * - plain ground or ore, never the core, lava, the dock pad or the artefact cache;
 * - the player's drill grade could dig it now (`ticksPerCell`, the tip of the last major against its
 *   hardness), and its drill class is ordinary, so a gated `scratchFloor` cell never moves;
 * - `canMine` has no verdict on it for the magnet (#142 "Constraints on other systems"): a rig- or
 *   dynamite-gated cell, or any other a gate holds, stays inside its gate;
 * - not yet yielded, unlined, and off every vehicle's anchor (#162 section 3.2).
 *
 * An open cell may take it when it touches the cell, lies in the same band (so the cell keeps its
 * gate row and its `bandOrePriceAt` band), is air that never yielded and is open by the yield
 * rule's measure (density at half or below, #36), has no lining, is off every anchor, and gives the cell the same gate verdicts it had where it lay. A yielded tile reads as air
 * whatever it holds and stays yielded (#36), so a cell written into a drilled tunnel would be lost:
 * the open cells a magnet fills are the planet's caves. Air is all a move leaves behind.
 */
import { ECONOMY } from '../../economy/economy'
import type { MagnetCaps } from '../../economy/magnetCaps'
import type { GateVerdict } from '../../registries/gateChecks'
import type { DrillStats } from '../../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../../vehicle/energyQuanta'
import type { IntegerVector } from '../../vehicle/vehiclePose'
import { cellDensitySum, cellSampleIndices, YIELD_SUM } from '../../world/cellYield'
import { bandOfTile } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import { chunkOfTile, type TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, currentCasingOfChunk, isTileYielded, materialCellAt } from '../../world/worldState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { gateOfCell, type GateAsker } from '../cellGates'
import { ticksPerCell } from '../groundDrill'
import { heatThrottledDrill } from '../heatRules'
import { drillClassOfCell } from '../signatureCells'
import { isAnchoredByAnyVehicle, vehicleCentresOf } from '../terrain/terrainAnchors'

/** The cells a field may move: what the lock calls diggable. */
const MOVABLE_KINDS: ReadonlySet<number> = new Set([CELL_KIND.ground, CELL_KIND.ore])

/** The planet as one magnet use reads it, and the tiles the use has already taken. */
export interface MagnetGround {
  state: AuthorityState
  params: PlanetParams
  caps: MagnetCaps
  /** The player's drill as it digs now, heat throttle included. */
  drill: DrillStats
  vehicles: readonly IntegerVector[]
  /** The magnet asking `canMine`, by its `source`. */
  toolAsker: GateAsker
  /** The player's drill asking, for the verdict a moved cell must keep. */
  drillAsker: GateAsker
  /** Tiles a move of this use left or entered: each tile takes part in one move at most. */
  taken: Set<string>
}

export function openMagnetGround(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  source: string,
): MagnetGround {
  const asker = { state, playerId, params, blast: null }
  return {
    state,
    params,
    caps: ECONOMY.magnets,
    drill: heatThrottledDrill(params.planetIndex, vehicleOf(state, playerId)),
    vehicles: vehicleCentresOf(state),
    toolAsker: { ...asker, tool: source },
    drillAsker: asker,
    taken: new Set(),
  }
}

/** Whether the field may move or hold the cell at `tile` (the module comment's first list). */
export function isMagnetMovable(ground: MagnetGround, tile: TilePoint): boolean {
  const cell = cellAt(ground.state.world, ground.params, tile)
  if (!MOVABLE_KINDS.has(kindOfCell(cell)) || isTaken(ground, tile)) return false
  if (!isFreeOfCasingAndAnchor(ground, tile)) return false
  return isDiggable(ground, tile, cell) && isLooseAt(ground, tile, cell)
}

/** Whether the open cell `to` may take the cell the field moves off `from`. */
export function canTakeMovedCell(ground: MagnetGround, from: TilePoint, to: TilePoint): boolean {
  if (!isTouching(from, to) || isTaken(ground, to) || !isSameBand(ground, from, to)) return false
  return isOpenCell(ground, to) && keepsGate(ground, from, to)
}

/** The energy the drill would spend digging the cell at `tile` now, in quanta. */
export function digQuantaOfCell(ground: MagnetGround, tile: TilePoint): number {
  const cell = cellAt(ground.state.world, ground.params, tile)
  const ticks = ticksPerCell(ground.drill, ground.params, tile, cell) ?? 0
  return ticks * ENERGY_QUANTA_PER_TICK.drill
}

export function takeTiles(ground: MagnetGround, tiles: readonly TilePoint[]): void {
  for (const tile of tiles) ground.taken.add(keyOf(tile))
}

function isTaken(ground: MagnetGround, tile: TilePoint): boolean {
  return ground.taken.has(keyOf(tile))
}

function isFreeOfCasingAndAnchor(ground: MagnetGround, tile: TilePoint): boolean {
  return isCasingFree(ground, tile) && !isAnchoredByAnyVehicle(ground.vehicles, tile)
}

/** The drill grade could dig it now, and it is no gated `scratchFloor` cell. */
function isDiggable(ground: MagnetGround, tile: TilePoint, cell: number): boolean {
  if (drillClassOfCell(ground.params, tile, cell) !== 'ordinary') return false
  return ticksPerCell(ground.drill, ground.params, tile, cell) !== null
}

/** `canMine` has nothing to say about `cell` at `tile` for the magnet. */
function isLooseAt(ground: MagnetGround, tile: TilePoint, cell: number): boolean {
  return gateOfCell(new Map(), ground.toolAsker, { tile, cell }) === null
}

/** Air that never yielded, open by the yield rule's measure, unlined and off every anchor. */
function isOpenCell(ground: MagnetGround, tile: TilePoint): boolean {
  const { world } = ground.state
  const material = materialCellAt(world, ground.params, tile)
  if (kindOfCell(material) !== CELL_KIND.air || isTileYielded(world, tile)) return false
  if (cellDensitySum(world, ground.params, tile) > YIELD_SUM) return false
  return isFreeOfCasingAndAnchor(ground, tile)
}

/** At `to` the moving cell is as loose, as ordinary and as drill-gated as it was at `from`. */
function keepsGate(ground: MagnetGround, from: TilePoint, to: TilePoint): boolean {
  const cell = cellAt(ground.state.world, ground.params, from)
  if (drillClassOfCell(ground.params, to, cell) !== 'ordinary') return false
  if (!isLooseAt(ground, to, cell)) return false
  return isSameVerdict(drillVerdictAt(ground, from, cell), drillVerdictAt(ground, to, cell))
}

function drillVerdictAt(ground: MagnetGround, tile: TilePoint, cell: number): GateVerdict | null {
  return gateOfCell(new Map(), ground.drillAsker, { tile, cell })?.verdict ?? null
}

/** The same gate answer; `have` is the player's side and reads the same at either tile. */
function isSameVerdict(a: GateVerdict | null, b: GateVerdict | null): boolean {
  if (a === null || b === null) return a === b
  return a.outcome === b.outcome && a.gateKind === b.gateKind && a.required === b.required
}

/** No casing value on any sample, breached or whole: the K6 density edit skips a cased sample. */
function isCasingFree(ground: MagnetGround, tile: TilePoint): boolean {
  const casing = currentCasingOfChunk(
    ground.state.world,
    chunkOfTile(tile.tx),
    chunkOfTile(tile.ty),
  )
  return cellSampleIndices(tile).every((index) => casing[index] === 0)
}

function isSameBand(ground: MagnetGround, from: TilePoint, to: TilePoint): boolean {
  return bandOfTile(ground.params, from.tx, from.ty) === bandOfTile(ground.params, to.tx, to.ty)
}

/** One cell over, side or corner. */
function isTouching(from: TilePoint, to: TilePoint): boolean {
  return Math.max(Math.abs(to.tx - from.tx), Math.abs(to.ty - from.ty)) === 1
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
