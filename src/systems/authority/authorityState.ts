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
import { initialSectionsOf, type SliceSections } from '../registries/saveSections'
import { newVehicleState, type VehicleState } from '../vehicle/vehicleState'
import { EMPTY_WORLD, type WorldState } from '../world/worldState'
import { NO_COLLAPSE, type CollapseState } from './collapse/collapseState'
import { NO_LOOSE_LAVA, type LavaState } from './lava/lavaState'
import { NEW_COMBAT, type CombatState } from './combat/combatState'
import { NEW_CORE_PROGRESS, type CoreProgress } from './coreProgress'
import type { HeldArtefact } from './heldArtefact'
import { NEW_PLATFORM, type PlatformState } from './platformState'
import { dockSiteOfPlanet, type SessionPlanet } from './planetOfState'

export interface PlayerState {
  wallet: Money
  /** The `seq` of this player's last accepted command; the next one must be higher. */
  lastSeq: number
  vehicle: VehicleState
  /** At most one artefact in the slice (#46); null until a cache is chosen from. */
  artefact: HeldArtefact | null
  /** The slices' player sections (feature-slices.md 3.13); omitted while none is registered. */
  slices?: SliceSections
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
  /** Enemies and what combat remembers per vehicle (#9); transient, empty after every dock. */
  combat: CombatState
  /** Blocks warning or refilling (#43); authority-only, emptied on every planet. */
  collapse: CollapseState
  /** Lava flowing on a heat planet (#113); emptied on every planet. */
  lava: LavaState
  /** Set by the first accepted `debug.*` command and never reset (#11 section 4). */
  debugApplied: boolean
  /** The slices' session sections (feature-slices.md 3.13); omitted while none is registered. */
  slices?: SliceSections
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
    combat: NEW_COMBAT,
    collapse: NO_COLLAPSE,
    lava: NO_LOOSE_LAVA,
    debugApplied: false,
    ...initialSectionsOf('session'),
  }
}

function newPlayerState(planet: SessionPlanet): PlayerState {
  return {
    wallet: ZERO_MONEY,
    lastSeq: 0,
    vehicle: newVehicleState(dockSiteOfPlanet(planet), 0),
    artefact: null,
    ...initialSectionsOf('player'),
  }
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

export function withArtefact(
  state: AuthorityState,
  playerId: string,
  artefact: HeldArtefact | null,
): AuthorityState {
  const player = state.players[playerId]
  return { ...state, players: { ...state.players, [playerId]: { ...player, artefact } } }
}

export function withCombat(state: AuthorityState, combat: CombatState): AuthorityState {
  return { ...state, combat }
}

export function withCollapse(state: AuthorityState, collapse: CollapseState): AuthorityState {
  return { ...state, collapse }
}
