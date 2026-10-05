/**
 * What the authority owns (decision #3): the planet and its world deltas, the platform shared by
 * everyone in the session (#8, #10), and per player the wallet, the vehicle and the last accepted
 * `seq`. Immutable: `applyCommand` returns a new state.
 * Only safe integers, booleans, strings, null and Money live here, so the canonical JSON and the
 * digest are exact.
 *
 * The vehicle's physics pose is client-owned (#3); the authority keeps the last reported one.
 */
import { ZERO_MONEY, type Money } from '../money'
import { newVehicleState, type VehicleState } from '../vehicle/vehicleState'
import { EMPTY_WORLD, type WorldState } from '../world/worldState'
import { NEW_CORE_PROGRESS, type CoreProgress } from './coreProgress'
import { NEW_PLATFORM, type PlatformState } from './platformState'
import { dockSiteOfPlanet, type SessionPlanet } from './planetOfState'

export interface PlayerState {
  wallet: Money
  /** The `seq` of this player's last accepted command; the next one must be higher. */
  lastSeq: number
  vehicle: VehicleState
}

export interface AuthorityState {
  tick: number
  /** Integer planet index (#4) and the world seed; the store still calls the index `planetTier`. */
  planet: SessionPlanet
  players: Readonly<Record<string, PlayerState>>
  world: WorldState
  platform: PlatformState
  /** The core of the planet the session is on (#10); fresh on every planet. */
  core: CoreProgress
  /** Set by the first accepted `debug.*` command and never reset (#11 section 4). */
  debugApplied: boolean
}

export interface SessionStart {
  planetIndex: number
  planetSeed: number
  playerIds: readonly string[]
}

export function createAuthorityState(start: SessionStart): AuthorityState {
  const planet = { index: start.planetIndex, seed: start.planetSeed }
  return {
    tick: 0,
    planet,
    players: Object.fromEntries(start.playerIds.map((id) => [id, newPlayerState(planet)])),
    world: EMPTY_WORLD,
    platform: NEW_PLATFORM,
    core: NEW_CORE_PROGRESS,
    debugApplied: false,
  }
}

function newPlayerState(planet: SessionPlanet): PlayerState {
  return { wallet: ZERO_MONEY, lastSeq: 0, vehicle: newVehicleState(dockSiteOfPlanet(planet), 0) }
}

export function vehicleOf(state: AuthorityState, playerId: string): VehicleState {
  return state.players[playerId].vehicle
}

export function withVehicle(
  state: AuthorityState,
  playerId: string,
  vehicle: VehicleState,
): AuthorityState {
  const player = state.players[playerId]
  return { ...state, players: { ...state.players, [playerId]: { ...player, vehicle } } }
}

export function withWallet(state: AuthorityState, playerId: string, wallet: Money): AuthorityState {
  const player = state.players[playerId]
  return { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } }
}
