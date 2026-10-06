/**
 * The HUD's position and state readouts (#33 section 5): depth (the log envelope's `depthTiles`,
 * or "ALT n" above the surface) and band, the dock arrow and core distance, and the vehicle state
 * with the tow countdown. Each state has a text and an icon id, so none is read by colour alone.
 */
import { DESTROY_DELAY_TICKS, STRAND_GRACE_TICKS } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { enemiesOwnedBy } from '../authority/combat/combatState'
import { dockSiteOfPlanet, planetParamsOf } from '../authority/planetOfState'
import { vehicleStateIconIdOf } from '../art/icons/iconSet'
import { tileOfPose, type VehiclePose } from '../vehicle/vehiclePose'
import { VEHICLE_MODES, type VehicleMode, type VehicleState } from '../vehicle/vehicleState'
import { bayRestPointOf } from '../world/dockBays'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { coreEdgeDistance, localOctantOf, tileDistance } from './compass'

export interface DepthReading {
  text: string
  depthTiles: number
  altitudeTiles: number
  band: number | null
}

/**
 * The casing grade badge beside the depth while undocked (#41 casing feel): calm when the grade
 * holds the band, "WEAK" (and amber) when it does not, so it never reads by colour alone. While a
 * tunnel wrecker gnaws this vehicle's route it pulses "GNAW" in the same amber (#111 telegraph).
 */
export interface CasingBadge {
  text: string
  state: CasingBadgeState
}

export type CasingBadgeState = 'holds' | 'short' | 'gnawed'

export interface DockArrow {
  octant: number
  distance: number
}

export interface VehicleStateReading {
  mode: VehicleMode
  text: string
  icon: string
  /** Ticks until the tow arrives, while stranded or destroyed. */
  rescueCountdownTicks: number | null
  /** Whole seconds until the tow, rounded up: "tow in 3 s". */
  rescueCountdownText: string
}

const MODE_TEXTS: Readonly<Record<VehicleMode, string>> = {
  docked: 'DOCKED',
  active: 'UNDER WAY',
  stranded: 'STRANDED',
  destroyed: 'WRECKED',
}

/** Each state's text and its icon of the set (#158): the id is derived, so it always ships. */
const MODE_MARKERS: Readonly<Record<VehicleMode, { text: string; icon: string }>> =
  Object.fromEntries(
    VEHICLE_MODES.map((mode) => [
      mode,
      { text: MODE_TEXTS[mode], icon: vehicleStateIconIdOf(mode) },
    ]),
  ) as Record<VehicleMode, { text: string; icon: string }>

/** Null while docked: the grade is read at the platform then. */
export function casingBadgeOf(state: AuthorityState, playerId: string): CasingBadge | null {
  const vehicle = state.players[playerId].vehicle
  if (vehicle.mode === 'docked') return null
  const isShort = vehicle.casingShortBand !== null
  const isGnawed = isRouteBeingGnawed(state, playerId)
  return {
    text: casingBadgeTextOf(vehicle.casingGrade, isShort, isGnawed),
    state: casingBadgeStateOf(isShort, isGnawed),
  }
}

function casingBadgeTextOf(grade: number, isShort: boolean, isGnawed: boolean): string {
  const marks = [...(isShort ? ['WEAK'] : []), ...(isGnawed ? ['GNAW'] : [])]
  return [`G${grade}`, ...marks].join(' ')
}

/** A tunnel wrecker hunting this vehicle's route is gnawing a ring of it now. */
function isRouteBeingGnawed(state: AuthorityState, playerId: string): boolean {
  return enemiesOwnedBy(state.combat, playerId).some((enemy) => enemy.phase === 'gnaw')
}

function casingBadgeStateOf(isShort: boolean, isGnawed: boolean): CasingBadgeState {
  if (isGnawed) return 'gnawed'
  return isShort ? 'short' : 'holds'
}

export function depthReadingOf(
  state: AuthorityState,
  playerId: string,
  depthTiles: number,
): DepthReading {
  const params = planetParamsOf(state.planet)
  const altitudeTiles = altitudeOf(params, state.players[playerId].vehicle.pose)
  const isAboveGround = depthTiles === 0 && altitudeTiles > 0
  return {
    text: isAboveGround ? `ALT ${altitudeTiles}` : String(depthTiles),
    depthTiles,
    altitudeTiles,
    band: params === null ? null : bandAtDepth(params, depthTiles),
  }
}

/** The compass points home to the Sell bay, the first stop of every return (#37). */
export function dockArrowOf(state: AuthorityState, playerId: string): DockArrow | null {
  const site = dockSiteOfPlanet(state.planet)
  const pose = state.players[playerId].vehicle.pose
  if (site === null || pose === null) return null
  const dock = bayRestPointOf(site, 'sell')
  return {
    octant: localOctantOf(pose, dock.x - pose.x, dock.y - pose.y),
    distance: tileDistance(pose, dock),
  }
}

export function coreDistanceOf(state: AuthorityState, playerId: string): number | null {
  const params = planetParamsOf(state.planet)
  const pose = state.players[playerId].vehicle.pose
  if (params === null || pose === null) return null
  return coreEdgeDistance(pose, params.coreRadiusTiles)
}

export function vehicleStateReadingOf(vehicle: VehicleState, tick: number): VehicleStateReading {
  const countdown = rescueCountdownOf(vehicle, tick)
  return {
    mode: vehicle.mode,
    ...MODE_MARKERS[vehicle.mode],
    rescueCountdownTicks: countdown,
    rescueCountdownText:
      countdown === null ? '' : `tow in ${Math.ceil(countdown / TICKS_PER_SECOND)} s`,
  }
}

/** Every vehicle state's marker, for the accessibility check (#33 acceptance 10). */
export function vehicleModeMarkers(): Readonly<
  Record<VehicleMode, { text: string; icon: string }>
> {
  return MODE_MARKERS
}

function rescueCountdownOf(vehicle: VehicleState, tick: number): number | null {
  if (vehicle.mode !== 'stranded' && vehicle.mode !== 'destroyed') return null
  const delay = vehicle.mode === 'stranded' ? STRAND_GRACE_TICKS : DESTROY_DELAY_TICKS
  return Math.max(0, delay - (tick - vehicle.modeSinceTick))
}

/** The band of the tile `depthTiles` below the surface on the dock's column (x = 0). */
function bandAtDepth(params: PlanetParams, depthTiles: number): number {
  return bandOfTile(params, 0, surfaceRowOfColumn(0, params.radiusTiles) - depthTiles)
}

/**
 * Whole tiles of air under the vehicle's column down to the surface: 0 resting on the ground
 * (the row just above the surface tile), as `depthTilesAt` is 0 there too.
 */
function altitudeOf(params: PlanetParams | null, pose: VehiclePose | null): number {
  if (params === null || pose === null) return 0
  const tile = tileOfPose(pose)
  return Math.max(0, tile.ty - surfaceRowOfColumn(tile.tx, params.radiusTiles) - 1)
}
