/**
 * The portable snapshot of an authority session (#11 section 5): plain JSON, money as canonical
 * strings, and the versions it was taken under. It is the one serialiser shared by the debug API,
 * the checkpoint save contents and the co-op join snapshot (#3, #4).
 *
 * Restoring refuses, never migrates: a version mismatch, a malformed state or a digest that does
 * not match the state is a listed problem, and nothing is restored.
 */
import { fromCanonical, isNonNegativeMoneyText, toCanonical } from '../money'
import { GENERATOR_VERSION } from '../generatorVersion'
import type { AuthorityState, PlayerState } from './authorityState'
import { isJsonObject, isWholeNumber } from './payloadFields'
import { isPlatformVisualState, type PlatformState } from './platformState'
import { stateDigest } from './stateDigest'
import {
  portableVehicleOf,
  portableVehicleProblems,
  portableWorldOf,
  portableWorldProblems,
  vehicleOfPortable,
  worldOfPortable,
  type PortableVehicle,
  type PortableWorld,
} from './vehicleSnapshot'

/** 3: the platform's core bay and visual state joined the state (#23). */
export const SNAPSHOT_VERSION = 3

export interface SessionSnapshot {
  snapshotVersion: number
  generatorVersion: number
  tick: number
  state: PortableState
  /** FNV-1a 64 of the state (#11 section 3). */
  digest: string
}

/** AuthorityState with each Money written as its canonical string. */
export interface PortableState {
  tick: number
  planet: { index: number; seed: number }
  players: Record<string, PortablePlayer>
  world: PortableWorld
  platform: PlatformState
  debugApplied: boolean
}

interface PortablePlayer {
  wallet: string
  lastSeq: number
  vehicle: PortableVehicle
}

export function takeSnapshot(state: AuthorityState): SessionSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    tick: state.tick,
    state: portableStateOf(state),
    digest: stateDigest(state),
  }
}

function portableStateOf(state: AuthorityState): PortableState {
  return {
    tick: state.tick,
    planet: { ...state.planet },
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [
        id,
        {
          wallet: toCanonical(player.wallet),
          lastSeq: player.lastSeq,
          vehicle: portableVehicleOf(player.vehicle),
        },
      ]),
    ),
    world: portableWorldOf(state.world),
    platform: { ...state.platform },
    debugApplied: state.debugApplied,
  }
}

export type SnapshotRestore = { state: AuthorityState; problems: [] } | { problems: string[] }

export function readSnapshot(snapshot: unknown): SnapshotRestore {
  const problems = snapshotProblems(snapshot)
  if (problems.length > 0) return { problems }
  return verifiedRestore(snapshot as SessionSnapshot)
}

function verifiedRestore(snapshot: SessionSnapshot): SnapshotRestore {
  const state = authorityStateOf(snapshot.state)
  if (stateDigest(state) !== snapshot.digest) {
    return { problems: ['snapshot digest does not match its state'] }
  }
  return { state, problems: [] }
}

function authorityStateOf(portable: PortableState): AuthorityState {
  return {
    tick: portable.tick,
    planet: { index: portable.planet.index, seed: portable.planet.seed },
    players: Object.fromEntries(
      Object.entries(portable.players).map(([id, player]) => [id, playerStateOf(player)]),
    ),
    world: worldOfPortable(portable.world),
    platform: { ...portable.platform },
    debugApplied: portable.debugApplied,
  }
}

function playerStateOf(player: PortablePlayer): PlayerState {
  return {
    wallet: fromCanonical(player.wallet),
    lastSeq: player.lastSeq,
    vehicle: vehicleOfPortable(player.vehicle),
  }
}

function snapshotProblems(snapshot: unknown): string[] {
  if (!isJsonObject(snapshot)) return ['snapshot must be an object']
  return [
    ...versionProblems('snapshotVersion', snapshot.snapshotVersion, SNAPSHOT_VERSION),
    ...versionProblems('generatorVersion', snapshot.generatorVersion, GENERATOR_VERSION),
    ...(typeof snapshot.digest === 'string' ? [] : ['snapshot.digest must be a string']),
    ...portableStateProblems(snapshot.state, snapshot.tick),
  ]
}

function versionProblems(name: string, version: unknown, expected: number): string[] {
  if (version === expected) return []
  return [`snapshot.${name} is ${JSON.stringify(version)}, this build reads ${expected}`]
}

function portableStateProblems(state: unknown, tick: unknown): string[] {
  if (!isJsonObject(state)) return ['snapshot.state must be an object']
  return [
    ...(isWholeNumber(state.tick) && state.tick === tick
      ? []
      : ['snapshot.tick must match state.tick']),
    ...planetProblems(state.planet),
    ...playersProblems(state.players),
    ...portableWorldProblems(state.world),
    ...platformProblems(state.platform),
    ...(typeof state.debugApplied === 'boolean'
      ? []
      : ['snapshot.state.debugApplied must be a boolean']),
  ]
}

function planetProblems(planet: unknown): string[] {
  const isValid =
    isJsonObject(planet) && isWholeNumber(planet.index) && Number.isSafeInteger(planet.seed)
  return isValid ? [] : ['snapshot.state.planet must hold a whole index and a safe-integer seed']
}

function platformProblems(platform: unknown): string[] {
  const isValid =
    isJsonObject(platform) &&
    isWholeNumber(platform.coreBay) &&
    isPlatformVisualState(platform.visualState)
  return isValid ? [] : ['snapshot.state.platform must hold a whole coreBay and a visual state']
}

function playersProblems(players: unknown): string[] {
  if (!isJsonObject(players)) return ['snapshot.state.players must be an object']
  return Object.entries(players).flatMap(([id, player]) => portablePlayerProblems(id, player))
}

function portablePlayerProblems(id: string, player: unknown): string[] {
  const path = `snapshot.state.players.${id}`
  if (!isPortablePlayer(player)) return [`${path} must hold a money wallet and a whole lastSeq`]
  return portableVehicleProblems(player.vehicle, `${path}.vehicle`)
}

function isPortablePlayer(player: unknown): player is Record<string, unknown> {
  return (
    isJsonObject(player) && isNonNegativeMoneyText(player.wallet) && isWholeNumber(player.lastSeq)
  )
}
