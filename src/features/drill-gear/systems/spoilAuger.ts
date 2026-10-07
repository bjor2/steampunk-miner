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
import { isToggleEngaged } from '../../power-up-core'
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
  return backfillRowOf(pose, gearValueOf(SPOIL_AUGER_ID, 'fillBehindM')).filter(
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
