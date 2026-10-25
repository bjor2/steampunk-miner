/**
 * The Scree Plough's outcome (ticket 882, PK4c T2; the GD's final lock on #850, Systems' row
 * 6395065669 and the TD's ground-edit path): after a cut while the plough acts, the intact scree
 * cell just past the drill's stamp, the one the bit would cut next, is moved `sideTiles` to the
 * side, the facing's left before its right, into the first open cell. With neither side open
 * nothing moves, and the plough's −50% refill is all it does.
 *
 * - **Moved, never destroyed.** The two cells trade places through the world's terrain edit queue
 *   (K6, `terrainEdits.ts`), the path every power-up's ground edit takes: the scree cell opens and
 *   the open one packs solid, and their materials swap. The edit lands in the chunk deltas, so it
 *   saves per chunk, replays byte-identically, and a chunk loaded later shows it applied. It
 *   credits no ore and adds no cell.
 * - **At most one cell a cut**, never a cell already queued, never onto a rig: an open cell within
 *   the refill's clearance of any rig's body stays open (#43).
 *
 * `ScreeShoved` logs it as `scree_shoved` with both cells.
 */
import { COLLAPSE_VEHICLE_CLEARANCE_MM } from '../../../constants/balance'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleBodiesOf } from '../../../systems/authority/collapse/collapseWatch'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { hazardKindAtTile } from '../../../systems/authority/hazards/hazardCells'
import { isOpenTile } from '../../../systems/authority/hazards/hazardShove'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  queueTerrainEdit,
  type QueuedTerrainEdit,
} from '../../../systems/authority/terrain/terrainEdits'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { isToolActing } from '../../../systems/vehicle/actingTools'
import { drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import {
  facingVectorOf,
  tileOfMillimetres,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, materialCellAt } from '../../../systems/world/worldState'
import { actingToolWithVerb } from './kitToolRules'
import './kitOutcomeEvents'

const PLOUGH = actingToolWithVerb('shove_aside')
const SIDE_TILES =
  PLOUGH.acting.outcome.verb === 'shove_aside' ? PLOUGH.acting.outcome.sideTiles : 0

export const SCREE_SHOVE_REACTION: AuthorityReaction = {
  id: 'planet-kit.scree-shove',
  react: (_before, after, heard) => shoveScreeAhead(after, heard),
}

/** The plough's player, its pose and planet, after a cut while it acts. */
interface PloughingRig {
  playerId: string
  params: PlanetParams
  pose: VehiclePose
}

/** A scree cell and the open cell it moves to. */
interface ScreeMove {
  from: TilePoint
  to: TilePoint
}

function shoveScreeAhead(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const rig = ploughingRigOf(state, heard)
  if (rig === null) return unchanged(state)
  const move = screeMoveOf(state, rig)
  return move === null ? unchanged(state) : queueScreeMove(state, rig, move)
}

/** The player whose drill just cut with the plough acting; null for anyone else. */
function ploughingRigOf(state: AuthorityState, heard: readonly DomainEvent[]): PloughingRig | null {
  const drilled = heard.find((event) => event.type === 'DrillDamageDealt')
  const params = planetParamsOf(state.planet)
  if (drilled?.playerId === undefined || params === null) return null
  if (!Object.hasOwn(state.players, drilled.playerId)) return null
  const vehicle = vehicleOf(state, drilled.playerId)
  if (!isToolActing(vehicle, PLOUGH.toolId) || vehicle.pose === null) return null
  return { playerId: drilled.playerId, params, pose: vehicle.pose }
}

/** The scree cell the bit cuts next and its first open side cell; null when there is no move. */
function screeMoveOf(state: AuthorityState, rig: PloughingRig): ScreeMove | null {
  const stamp = drillStampOf(rig.pose, false)
  const [from] = drillGearCellsAt(rig.pose, stamp, { aheadCells: 1, sideCells: 0 }).ahead
  if (from === undefined || !isIntactScree(state, rig.params, from)) return null
  const to = sideTilesOf(rig.pose, from).find((tile) => isFreeOpenCell(state, rig.params, tile))
  return to === undefined ? null : { from, to }
}

/** Intact ground of the plough's hazard that no plough edit is moving yet. */
function isIntactScree(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  return (
    kindOfCell(cellAt(state.world, params, tile)) === CELL_KIND.ground &&
    hazardKindAtTile(state, params, tile) === PLOUGH.hazard &&
    !isQueuedByPlough(state, tile)
  )
}

/** Open, clear of every rig's body, and not already the end of a plough edit. */
function isFreeOpenCell(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  return (
    isOpenTile(state.world, params, tile) &&
    !isUnderARig(state, tile) &&
    !isQueuedByPlough(state, tile)
  )
}

/** The cell `SIDE_TILES` to the facing's left of `from`, then the one to its right. */
function sideTilesOf(pose: VehiclePose, from: TilePoint): TilePoint[] {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const left = { x: -ahead.y, y: ahead.x }
  const right = { x: ahead.y, y: -ahead.x }
  return [stepAside(from, left), stepAside(from, right)]
}

/** The tile under the point `SIDE_TILES` metres from `from`'s centre along a 1024-scaled side. */
function stepAside(from: TilePoint, side: IntegerVector): TilePoint {
  const reachMm = SIDE_TILES * MM_PER_METRE
  return tileOfMillimetres(
    from.tx * MM_PER_METRE + MM_PER_METRE / 2 + Math.floor((side.x * reachMm) / UP_VECTOR_SCALE),
    from.ty * MM_PER_METRE + MM_PER_METRE / 2 + Math.floor((side.y * reachMm) / UP_VECTOR_SCALE),
  )
}

/** Whether a rig's body centre lies within the clearance of any point of the tile (#43). */
function isUnderARig(state: AuthorityState, tile: TilePoint): boolean {
  return vehicleBodiesOf(state).some(({ centre }) => {
    const dx = centre.xMm - clamped(centre.xMm, tile.tx * MM_PER_METRE, MM_PER_METRE)
    const dy = centre.yMm - clamped(centre.yMm, tile.ty * MM_PER_METRE, MM_PER_METRE)
    return dx * dx + dy * dy < COLLAPSE_VEHICLE_CLEARANCE_MM * COLLAPSE_VEHICLE_CLEARANCE_MM
  })
}

function clamped(mm: number, low: number, size: number): number {
  return Math.min(Math.max(mm, low), low + size)
}

function isQueuedByPlough(state: AuthorityState, tile: TilePoint): boolean {
  return state.terrainEdits.some(
    (edit) => edit.source === PLOUGH.toolId && edit.cells.some((cell) => isTile(cell, tile)),
  )
}

function isTile(cell: { tx: number; ty: number }, tile: TilePoint): boolean {
  return cell.tx === tile.tx && cell.ty === tile.ty
}

function queueScreeMove(state: AuthorityState, rig: PloughingRig, move: ScreeMove): RuleEffect {
  const { playerId } = rig
  return {
    state: queueTerrainEdit(state, screeEditOf(state, rig, move)),
    events: [
      {
        type: 'planet-kit.ScreeShoved',
        playerId,
        fromTx: move.from.tx,
        fromTy: move.from.ty,
        toTx: move.to.tx,
        toTy: move.to.ty,
      },
    ],
  }
}

/** The scree cell opens and the open one packs solid, then their materials trade places. */
function screeEditOf(state: AuthorityState, rig: PloughingRig, move: ScreeMove): QueuedTerrainEdit {
  const { from, to } = move
  const materialOf = (tile: TilePoint) => materialCellAt(state.world, rig.params, tile)
  return {
    playerId: rig.playerId,
    source: PLOUGH.toolId,
    cells: [
      { kind: 'density', ...from, density: 0 },
      { kind: 'density', ...to, density: SOLID_DENSITY },
      { kind: 'swap', ...to, cell: materialOf(from) },
      { kind: 'swap', ...from, cell: materialOf(to) },
    ],
  }
}
