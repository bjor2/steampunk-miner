/**
 * Each player's live lodestone beacon (the `terrain-tools` save section v1, #162 section 3.1): the
 * beacon waits in the authority between its planting and its owner's next dock, where its delayed
 * edit is keyed to the planting tick, so the gather replays the same on every machine and survives
 * a save. Once the beacon has gathered, or its planet is left, the section goes back to its
 * initial value and so out of the state and the digest.
 *
 * A held lode clamp field (ticket 285, the GD ruling on #285 Q4) is saved here too, its pinned set
 * fixed at the act, so the braces it claims are derived from the save alone. The field is absent
 * while no clamp is held, so a save, a digest or a golden with no clamp is unchanged and the
 * section needs no new version.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** A planted beacon: where, on which planet, at which tick, and at which Mark. */
export interface LodestoneBeacon {
  tx: number
  ty: number
  planetIndex: number
  plantedTick: number
  mark: number
}

/** A lode clamp field being held: the cells it pins, fixed at the act, and its draw so far. */
export interface ClampField {
  /** At most `magnets.maxCellsMoved` cells, nearest the rig's tile first. */
  cells: readonly TilePoint[]
  startTick: number
  /** The tick the field runs out at its Mark's duration, if it is held that long. */
  finishTick: number
  /** Energy drawn so far, in quanta; `magnet_used` logs it when the field ends. */
  energy: number
}

export interface TerrainToolsState {
  /** One live beacon per planet (#162 row); null with none planted. */
  beacon: LodestoneBeacon | null
  /** Absent while no clamp is held. */
  clamp?: ClampField
}

export const NO_TERRAIN_TOOLS_STATE: TerrainToolsState = { beacon: null }

export const TERRAIN_TOOLS_SECTION: SaveSection<TerrainToolsState> = {
  id: 'terrain-tools',
  version: 1,
  scope: 'player',
  initial: NO_TERRAIN_TOOLS_STATE,
  problems: terrainToolsStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as TerrainToolsState,
}

export function terrainToolsOf(state: AuthorityState, playerId: string): TerrainToolsState {
  return readSection(state, playerId, TERRAIN_TOOLS_SECTION)
}

export function withBeacon(
  state: AuthorityState,
  playerId: string,
  beacon: LodestoneBeacon | null,
): AuthorityState {
  const { clamp } = terrainToolsOf(state, playerId)
  return withSection(state, playerId, TERRAIN_TOOLS_SECTION, { beacon, ...clampKeyOf(clamp) })
}

/** The player's clamp field set, or taken away with null. */
export function withClampField(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField | null,
): AuthorityState {
  const { beacon } = terrainToolsOf(state, playerId)
  return withSection(state, playerId, TERRAIN_TOOLS_SECTION, { beacon, ...clampKeyOf(clamp) })
}

/** Why a saved body is not a terrain-tools section; empty when it is one. */
export function terrainToolsStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['the terrain-tools section must be an object']
  return [...beaconProblems(body.beacon), ...clampProblems(body.clamp)]
}

/** The `clamp` key to spread: none while no field is held, so the section stays at initial. */
function clampKeyOf(clamp: ClampField | null | undefined): { clamp?: ClampField } {
  return clamp === undefined || clamp === null ? {} : { clamp }
}

function beaconProblems(beacon: unknown): string[] {
  return beacon === null || isBeacon(beacon) ? [] : ['terrain-tools.beacon is malformed']
}

function clampProblems(clamp: unknown): string[] {
  return clamp === undefined || isClampField(clamp) ? [] : ['terrain-tools.clamp is malformed']
}

function isClampField(clamp: unknown): boolean {
  return (
    isJsonObject(clamp) &&
    Array.isArray(clamp.cells) &&
    clamp.cells.every(isTile) &&
    isWholeNumber(clamp.startTick) &&
    isWholeNumber(clamp.finishTick) &&
    isWholeNumber(clamp.energy)
  )
}

function isTile(tile: unknown): boolean {
  return isJsonObject(tile) && Number.isSafeInteger(tile.tx) && Number.isSafeInteger(tile.ty)
}

function isBeacon(beacon: unknown): boolean {
  return (
    isJsonObject(beacon) &&
    Number.isSafeInteger(beacon.tx) &&
    Number.isSafeInteger(beacon.ty) &&
    isWholeNumber(beacon.planetIndex) &&
    isWholeNumber(beacon.plantedTick) &&
    isWholeNumber(beacon.mark)
  )
}
