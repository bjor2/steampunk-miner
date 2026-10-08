/**
 * The spoil auger (#162 section 1 and 4.4, G&V feel pass D): while switched on, it backfills the
 * tunnel behind the miner with common spoil, blocking pursuers and lava. Each tick it looks at the
 * row across the tunnel behind the hull (`backfillRowOf`) and queues a K6 edit (feature-slices.md
 * 3.16) that turns every open tile of it into packed plain ground. Its energy draw while on is the
 * `power-up` kind's (`power-up-core.draw-toggles`, 0.3% of `energyMax` a second).
 *
 * It fills only tunnel the drill bored (a yielded tile, now at most half solid), never a cave, the
 * pad, lava or core; never a tile with any lining in it, so a lined or cased section stays open;
 * and never a tile within `vehicleClearanceM` of any vehicle, so it cannot trap a teammate or move
 * anyone. A yielded tile never yields again, so the spoil holds no ore.
 *
 * Its Mark milestones (#256, a toggle's hold at Mark 3 and second tap at Mark 6) each pack a plug
 * at once as they act, under the same rules, and leave it switched on: the hold three rows deep
 * from the usual row back, the second tap one row five tiles wide a metre past the usual row.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  queueTerrainEdit,
  type TerrainCellEdit,
} from '../../../systems/authority/terrain/terrainEdits'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import { cellDensitySum, cellSampleIndices } from '../../../systems/world/cellYield'
import { isLined } from '../../../systems/world/chunkDelta'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { SAMPLES_PER_TILE, SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { chunkOfTile, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, GROUND_CELL, kindOfCell } from '../../../systems/world/worldCell'
import {
  currentCasingOfChunk,
  isTileYielded,
  materialCellAt,
} from '../../../systems/world/worldState'
import { MM_PER_METRE } from '../../../constants/physics'
import { isToggleEngaged, type PowerUpOutcome, type PowerUpUse } from '../../power-up-core'
import { backfillRowOf, isTileClearOfHull } from './backfillRow'
import { gearValueOf } from './drillGearItems'
import './drillGearEvents'

export const SPOIL_AUGER_ID = 'gear.spoil_auger'

/** The terrain queue's `source` for a backfill, so the slice knows its own edits. */
export const BACKFILL_SOURCE = 'drill-gear.spoil_auger'

export const SPOIL_AUGER_STEP: ClockStep = {
  id: 'drill-gear.spoil-auger',
  nextTick: (state) => (augeringPlayersOf(state).length > 0 ? state.tick + 1 : null),
  run: backfillBehindAugers,
}

const FULL_TILE_DENSITY = SAMPLES_PER_TILE * SAMPLES_PER_TILE * SOLID_DENSITY

/** The hold's plug: the usual row and the two behind it. */
const PLUG_ROWS = 3
/** The second tap's row: two tiles each side of the middle, five wide. */
const WIDE_ROW_SIDE_TILES = 2

/** No open tunnel tile where the plug would go. */
export const NOTHING_TO_PACK = 'drill-gear.nothing_to_pack'

/**
 * The auger's act: switching on changes nothing by itself (the clock step fills while it is on);
 * a Mark milestone's hold or second tap packs its plug at once.
 */
export function actAuger(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const params = planetParamsOf(state.planet)
  const pose = vehicleOf(state, use.playerId).pose
  if (use.milestone === undefined || params === null || pose === null)
    return { kind: 'acted', effect: unchanged(state) }
  const tiles = fillableOf(state, params, plugTilesOf(use, pose))
  if (tiles.length === 0) return { kind: 'refused', reason: NOTHING_TO_PACK }
  return { kind: 'acted', effect: queueBackfill(state, use.playerId, tiles) }
}

/** The hold's rows three deep; the second tap's one row five wide, a metre further back. */
function plugTilesOf(use: PowerUpUse, pose: VehiclePose): TilePoint[] {
  const fillBehindM = gearValueOf(SPOIL_AUGER_ID, 'fillBehindM')
  if (use.milestone === 'second-tap')
    return backfillRowOf(pose, fillBehindM + 1, WIDE_ROW_SIDE_TILES)
  return Array.from({ length: PLUG_ROWS }, (_, row) =>
    backfillRowOf(pose, fillBehindM + row),
  ).flat()
}

/** The material a tunnel tile may hold to be filled: plain ground or mined-out ore. */
const FILLED_KINDS: readonly number[] = [CELL_KIND.ground, CELL_KIND.ore]

function backfillBehindAugers(state: AuthorityState): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  return chainEffects(
    state,
    augeringPlayersOf(state).map(
      (playerId) => (current: AuthorityState) => backfillBehind(current, params, playerId),
    ),
  )
}

/** Players whose switched-on auger rides an active vehicle, sorted so every machine agrees. */
function augeringPlayersOf(state: AuthorityState): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => isAugering(state, playerId))
}

function isAugering(state: AuthorityState, playerId: string): boolean {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode !== 'active' || vehicle.pose === null) return false
  return isToggleEngaged(state, playerId, SPOIL_AUGER_ID)
}

function backfillBehind(state: AuthorityState, params: PlanetParams, playerId: string): RuleEffect {
  const pose = vehicleOf(state, playerId).pose
  if (pose === null) return unchanged(state)
  return queueBackfill(state, playerId, backfillTilesOf(state, params, pose))
}

/** The open tunnel tiles of the row behind the hull that the auger may fill now. */
function backfillTilesOf(
  state: AuthorityState,
  params: PlanetParams,
  pose: VehiclePose,
): TilePoint[] {
  return fillableOf(state, params, backfillRowOf(pose, gearValueOf(SPOIL_AUGER_ID, 'fillBehindM')))
}

/** The tiles the auger may fill now: open tunnel, clear of every vehicle, not queued already. */
function fillableOf(
  state: AuthorityState,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): TilePoint[] {
  return tiles.filter(
    (tile) =>
      isOpenTunnel(state, params, tile) && isClearOfVehicles(state, tile) && !isQueued(state, tile),
  )
}

/** Bored, unlined ground or ore that is at most half solid now. */
function isOpenTunnel(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  if (!isTileYielded(state.world, tile)) return false
  if (!FILLED_KINDS.includes(kindOfCell(materialCellAt(state.world, params, tile)))) return false
  return (
    cellDensitySum(state.world, params, tile) * 2 <= FULL_TILE_DENSITY && !isLinedTile(state, tile)
  )
}

function isLinedTile(state: AuthorityState, tile: TilePoint): boolean {
  const casing = currentCasingOfChunk(state.world, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  return cellSampleIndices(tile).some((index) => isLined(casing[index]))
}

/** At least `vehicleClearanceM` from the hull of every vehicle on the planet. */
function isClearOfVehicles(state: AuthorityState, tile: TilePoint): boolean {
  const clearanceMm = gearValueOf(SPOIL_AUGER_ID, 'vehicleClearanceM') * MM_PER_METRE
  return Object.values(state.players).every(
    ({ vehicle }) => vehicle.pose === null || isTileClearOfHull(vehicle.pose, tile, clearanceMm),
  )
}

/** A backfill still waiting in the queue for the tile. */
function isQueued(state: AuthorityState, tile: TilePoint): boolean {
  return state.terrainEdits.some(
    (edit) =>
      edit.source === BACKFILL_SOURCE &&
      edit.cells.some((cell) => cell.tx === tile.tx && cell.ty === tile.ty),
  )
}

function queueBackfill(
  state: AuthorityState,
  playerId: string,
  tiles: readonly TilePoint[],
): RuleEffect {
  if (tiles.length === 0) return unchanged(state)
  return {
    state: queueTerrainEdit(state, { playerId, source: BACKFILL_SOURCE, cells: spoilOf(tiles) }),
    events: tiles.map(({ tx, ty }): DomainEventBody => ({
      type: 'drill-gear.TunnelBackfilled',
      playerId,
      tx,
      ty,
    })),
  }
}

/** Each tile packed solid and made plain ground, so the spoil reads as common rock. */
function spoilOf(tiles: readonly TilePoint[]): TerrainCellEdit[] {
  return tiles.flatMap(({ tx, ty }): TerrainCellEdit[] => [
    { kind: 'density', tx, ty, density: SOLID_DENSITY },
    { kind: 'swap', tx, ty, cell: GROUND_CELL },
  ])
}
