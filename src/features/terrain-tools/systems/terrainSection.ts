/**
 * Each player's live lodestone beacon (the `terrain-tools` save section v1, #162 section 3.1): the
 * beacon waits in the authority between its planting and its owner's next dock, where its delayed
 * edit is keyed to the planting tick, so the gather replays the same on every machine and survives
 * a save. Once the beacon has gathered, or its planet is left, the section goes back to its
 * initial value and so out of the state and the digest.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

/** A planted beacon: where, on which planet, at which tick, and at which Mark. */
export interface LodestoneBeacon {
  tx: number
  ty: number
  planetIndex: number
  plantedTick: number
  mark: number
}

export interface TerrainToolsState {
  /** One live beacon per planet (#162 row); null with none planted. */
  beacon: LodestoneBeacon | null
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
  return withSection(state, playerId, TERRAIN_TOOLS_SECTION, { beacon })
}

/** Why a saved body is not a terrain-tools section; empty when it is one. */
export function terrainToolsStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['the terrain-tools section must be an object']
  if (body.beacon === null) return []
  return isBeacon(body.beacon) ? [] : ['terrain-tools.beacon is malformed']
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
