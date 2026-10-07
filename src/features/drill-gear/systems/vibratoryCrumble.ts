/**
 * The vibratory bit (#162 section 1 and 4.4; the GD lock on #205: an authority reaction with a K6
 * density edit, no kernel hook). After a drill command the head works, common ground ahead of the
 * bit with `H <= 0.5 P` (P the drill's tip, #7's notation) crumbles: its unlined samples open
 * through the world's terrain queue (feature-slices.md 3.16), so the bit tunnels faster through
 * soft rock.
 *
 * Only plain ground crumbles: never ore (mined normally), core, the pad or lava, and lining holds
 * because a density edit never touches it. Gate checks hold ore cells only (3.6), so no gated cell
 * is ever crumbled. The cells are the ones the kernel's drill gear geometry lists past the stamp's
 * rim (`drillGearCellsAt`), at the level cut's stamp, so the crumble and the reach boom name the
 * same cell. It only opens the ground the bit would cut next, so it never traps or moves a vehicle.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { hardnessOfTile } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  queueTerrainEdit,
  type QueuedTerrainEdit,
} from '../../../systems/authority/terrain/terrainEdits'
import { cmp, fromSafeInteger, mul, type BigStat } from '../../../systems/money'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import { itemInSlot } from '../../../systems/vehicle/loadoutState'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { gearValueOf } from './drillGearItems'
import './drillGearEvents'

export const VIBRATORY_BIT_ID = 'gear.vibratory_bit'

/** The terrain queue's `source` for a crumble, so the slice knows its own edits. */
export const CRUMBLE_SOURCE = 'drill-gear.vibratory_bit'

export const VIBRATORY_CRUMBLE_REACTION: AuthorityReaction = {
  id: 'drill-gear.vibratory-crumble',
  react: crumbleAheadOfBit,
}

/** What the crumble needs to know of one player's drill. */
interface WorkingBit {
  playerId: string
  params: PlanetParams
  pose: VehiclePose
  drillTip: BigStat
}

function crumbleAheadOfBit(
  _before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const bit = workingBitOf(after, heard)
  if (bit === null) return unchanged(after)
  return queueCrumble(after, bit.playerId, crumblingCellsOf(after, bit))
}

/** The player whose vibratory bit just drilled, with its pose and tip; null for anyone else. */
function workingBitOf(state: AuthorityState, heard: readonly DomainEvent[]): WorkingBit | null {
  const drilled = heard.find((event) => event.type === 'DrillDamageDealt')
  const params = planetParamsOf(state.planet)
  if (drilled?.playerId === undefined || params === null) return null
  if (!Object.hasOwn(state.players, drilled.playerId)) return null
  const vehicle = vehicleOf(state, drilled.playerId)
  if (itemInSlot(vehicle.loadout, 'drill.head') !== VIBRATORY_BIT_ID || vehicle.pose === null) {
    return null
  }
  const { drillTip } = heatThrottledDrill(params.planetIndex, vehicle)
  return { playerId: drilled.playerId, params, pose: vehicle.pose, drillTip }
}

/** The cells ahead of the bit that crumble now, nearest first. */
function crumblingCellsOf(state: AuthorityState, bit: WorkingBit): TilePoint[] {
  const aheadCells = gearValueOf(VIBRATORY_BIT_ID, 'crumbleAheadCells')
  const stamp = drillStampOf(bit.pose, false)
  return drillGearCellsAt(bit.pose, stamp, { aheadCells, sideCells: 0 }).ahead.filter(
    (tile) => isCrumblingCell(state, bit, tile) && !isCrumbleQueued(state, tile),
  )
}

/** Intact plain ground no harder than the bit's share of the tip. */
function isCrumblingCell(state: AuthorityState, bit: WorkingBit, tile: TilePoint): boolean {
  const cell = cellAt(state.world, bit.params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ground) return false
  return isSoftForTip(hardnessOfTile(bit.params, tile, cell), bit.drillTip)
}

/** `H <= share * P`, compared as `H * 10000 <= P * shareBp` so no division rounds. */
function isSoftForTip(hardness: BigStat, drillTip: BigStat): boolean {
  const shareBp = fromSafeInteger(gearValueOf(VIBRATORY_BIT_ID, 'crumbleHardnessBp'))
  return cmp(mul(hardness, fromSafeInteger(BASIS_POINTS)), mul(drillTip, shareBp)) <= 0
}

/** A crumble still waiting in the queue for the tile: the next command asks for it again. */
function isCrumbleQueued(state: AuthorityState, tile: TilePoint): boolean {
  return state.terrainEdits.some((edit) => edit.source === CRUMBLE_SOURCE && hasTile(edit, tile))
}

function hasTile(edit: QueuedTerrainEdit, tile: TilePoint): boolean {
  return edit.cells.some((cell) => cell.tx === tile.tx && cell.ty === tile.ty)
}

function queueCrumble(
  state: AuthorityState,
  playerId: string,
  tiles: readonly TilePoint[],
): RuleEffect {
  if (tiles.length === 0) return unchanged(state)
  const cells = tiles.map(({ tx, ty }) => ({ kind: 'density' as const, tx, ty, density: 0 }))
  return {
    state: queueTerrainEdit(state, { playerId, source: CRUMBLE_SOURCE, cells }),
    events: tiles.map(({ tx, ty }): DomainEventBody => ({
      type: 'drill-gear.GroundCrumbled',
      playerId,
      tx,
      ty,
    })),
  }
}
