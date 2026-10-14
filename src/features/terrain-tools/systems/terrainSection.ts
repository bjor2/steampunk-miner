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
 * section needs no new version. The Ore Lure twist's magnet plate (ticket 329) is one more such
 * field, absent while no plate is left, and so are the Bracer fork branch's props (ticket 269),
 * absent while none holds. Stabiliser foam's set cells (ticket 381, the TD line of the GD ruling
 * on #381) are another: each cell with its planet and the tick its foam lapses, absent once the
 * last has lapsed, so a save from before foam loads with none.
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
  /**
   * The gather's swap cap when a sibling-link planted it at reduced strength (#256); absent for
   * the item's own 256, so a beacon planted by hand saves and digests as before.
   */
  swapCap?: number
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

/**
 * One cell foam has set (ticket 381): it holds from `setTick`, the first spray of an unbroken run,
 * until `untilTick`, which a fresh spray moves on, never adds to.
 */
export interface FoamedCell {
  tx: number
  ty: number
  /** Foam holds only on the planet it was sprayed on. */
  planetIndex: number
  setTick: number
  /** The first tick the foam no longer holds. */
  untilTick: number
}

/** The Ore Lure's magnet plate, left on the tunnel wall at a tile of a planet (ticket 329). */
export interface LurePlate {
  tx: number
  ty: number
  planetIndex: number
}

/** A Bracer prop holding one warning collapse block of a planet until a tick (ticket 269). */
export interface BracerProp {
  /** `cx,cy#index` (`collapseBlock.blockIdOf`). */
  block: string
  planetIndex: number
  /** The first tick it no longer holds. */
  untilTick: number
}

export interface TerrainToolsState {
  /** One live beacon per planet (#162 row); null with none planted. */
  beacon: LodestoneBeacon | null
  /** Absent while no clamp is held. */
  clamp?: ClampField
  /** Absent while no Ore Lure plate is left. */
  plate?: LurePlate
  /** Absent while no Bracer prop holds. */
  props?: readonly BracerProp[]
  /** Absent while no foam holds; sorted by `tx`, then `ty`, each cell once. */
  foam?: readonly FoamedCell[]
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
  return withTerrainTools(state, playerId, { ...terrainToolsOf(state, playerId), beacon })
}

/** The player's clamp field set, or taken away with null. */
export function withClampField(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField | null,
): AuthorityState {
  const { clamp: _held, ...unclamped } = terrainToolsOf(state, playerId)
  return withTerrainTools(state, playerId, { ...unclamped, ...clampKeyOf(clamp) })
}

/** The player's Ore Lure plate left, moved, or taken away with null. */
export function withLurePlate(
  state: AuthorityState,
  playerId: string,
  plate: LurePlate | null,
): AuthorityState {
  const { plate: _left, ...withoutPlate } = terrainToolsOf(state, playerId)
  return withTerrainTools(
    state,
    playerId,
    plate === null ? withoutPlate : { ...withoutPlate, plate },
  )
}

/** The player's Bracer props, or none with an empty list. */
export function withBracerProps(
  state: AuthorityState,
  playerId: string,
  props: readonly BracerProp[],
): AuthorityState {
  const { props: _held, ...unpropped } = terrainToolsOf(state, playerId)
  return withTerrainTools(state, playerId, props.length === 0 ? unpropped : { ...unpropped, props })
}

/** The player's foamed cells set, or taken away with an empty list. */
export function withFoamedCells(
  state: AuthorityState,
  playerId: string,
  foam: readonly FoamedCell[],
): AuthorityState {
  const { foam: _set, ...unfoamed } = terrainToolsOf(state, playerId)
  return withTerrainTools(state, playerId, foam.length === 0 ? unfoamed : { ...unfoamed, foam })
}

function withTerrainTools(
  state: AuthorityState,
  playerId: string,
  value: TerrainToolsState,
): AuthorityState {
  return withSection(state, playerId, TERRAIN_TOOLS_SECTION, value)
}

/** Why a saved body is not a terrain-tools section; empty when it is one. */
export function terrainToolsStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['the terrain-tools section must be an object']
  return [
    ...beaconProblems(body.beacon),
    ...clampProblems(body.clamp),
    ...plateProblems(body.plate),
    ...propProblems(body.props),
    ...foamProblems(body.foam),
  ]
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

function plateProblems(plate: unknown): string[] {
  return plate === undefined || isLurePlate(plate) ? [] : ['terrain-tools.plate is malformed']
}

function propProblems(props: unknown): string[] {
  const isPropList = Array.isArray(props) && props.length > 0 && props.every(isBracerProp)
  return props === undefined || isPropList ? [] : ['terrain-tools.props is malformed']
}

function isBracerProp(prop: unknown): boolean {
  return (
    isJsonObject(prop) &&
    typeof prop.block === 'string' &&
    isWholeNumber(prop.planetIndex) &&
    isWholeNumber(prop.untilTick)
  )
}

function foamProblems(foam: unknown): string[] {
  return foam === undefined || isFoamList(foam) ? [] : ['terrain-tools.foam is malformed']
}

function isFoamList(foam: unknown): boolean {
  return Array.isArray(foam) && foam.length > 0 && foam.every(isFoamedCell)
}

function isFoamedCell(cell: unknown): boolean {
  return (
    isTile(cell) &&
    isJsonObject(cell) &&
    isWholeNumber(cell.planetIndex) &&
    isWholeNumber(cell.setTick) &&
    isWholeNumber(cell.untilTick)
  )
}

function isLurePlate(plate: unknown): boolean {
  return isTile(plate) && isJsonObject(plate) && isWholeNumber(plate.planetIndex)
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
    isWholeNumber(beacon.mark) &&
    (beacon.swapCap === undefined || isWholeNumber(beacon.swapCap))
  )
}
