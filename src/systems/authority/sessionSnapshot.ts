/**
 * The portable snapshot of an authority session (#11 section 5): plain JSON, money as canonical
 * strings, and the versions it was taken under. It is the one serialiser shared by the debug API,
 * the checkpoint save contents and the co-op join snapshot (#3, #4).
 *
 * Restoring refuses, never migrates: a version mismatch, a malformed state or a digest that does
 * not match the state is a listed problem, and nothing is restored. The slices' save sections
 * ride along under an optional `slices` key, each checked by its own version
 * (`sliceSectionSnapshot.ts`), so adding one never bumps `SNAPSHOT_VERSION`; a section an older
 * snapshot lacks restores at its initial value (#224).
 */
import { fromCanonical, isNonNegativeMoneyText, toCanonical } from '../money'
import { GENERATOR_VERSION } from '../generatorVersion'
import type { AuthorityState, PlayerState } from './authorityState'
import { portableCollapseOf, portableCollapseProblems } from './collapse/collapseSnapshot'
import type { CollapseState } from './collapse/collapseState'
import { portableLavaOf, portableLavaProblems, type LavaState } from './lava/lavaState'
import {
  portableLiveBlastsOf,
  portableLiveBlastsProblems,
  type LiveBlast,
} from './charges/liveBlast'
import {
  portableTerrainEditsOf,
  portableTerrainEditsProblems,
  type QueuedTerrainEdit,
} from './terrain/terrainEdits'
import {
  combatOfPortable,
  portableCombatOf,
  portableCombatProblems,
  type PortableCombat,
} from './combat/combatSnapshot'
import { coreProgressProblems, type CoreProgress } from './coreProgress'
import { heldArtefactProblems, type HeldArtefact } from './heldArtefact'
import { isJsonObject, isWholeNumber } from './payloadFields'
import { isPlatformVisualState, type PlatformState } from './platformState'
import { copyRefinerySlots, refinerySlotsProblems } from './refinery/refineryBatch'
import {
  missingSectionIdsOf,
  portableSectionsOf,
  portableSectionsProblems,
  sectionsOfPortable,
  type PortableSections,
} from './sliceSectionSnapshot'
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

/**
 * 18: the live blasts, each with its front cursor and running totals, and the queued power-up
 * terrain edits (K6 #189); 17: the vehicle's loadout as its `loadout` section v1 (K4, #162); 16: heat, lava and the lining types (#113, #96): the vehicle's lining and heat gauge, typed
 * casing values, the lava layer of chunk deltas and the loose lava; 15: each vehicle's charge
 * rack, carried charges and planted charge (#109, #95);
 * 14: what the vehicle's Sell bay visit has paid of its lining bill (#128); 13: the vehicle's
 * lining bill and each casing-trail point's axis length (#115, #76 amendment); 12: the Refinery
 * bay's slots on the platform (#105, #92); 11: the vehicle's guns and combat's gun timing and
 * unlogged hits (#93); 10: breached casing (#111, #94), 255 in the casing runs, and the
 * tunnel wrecker's combat state; 9: the blocks warning or
 * refilling (#43, #57); 8: the casing layer in chunk deltas (#41, #56); 7: each player's held artefact (#46); 6: the
 * vehicle's casing grade (#41, #58); 5: combat joined the state (#25); 4 the planet's core
 * progress (#24); 3 the platform (#23).
 */
export const SNAPSHOT_VERSION = 18

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
  core: CoreProgress
  combat: PortableCombat
  collapse: CollapseState
  lava: LavaState
  liveBlasts: LiveBlast[]
  terrainEdits: QueuedTerrainEdit[]
  debugApplied: boolean
  /** The session sections; omitted while none is registered. */
  slices?: PortableSections
}

export interface PortablePlayer {
  wallet: string
  lastSeq: number
  vehicle: PortableVehicle
  artefact: HeldArtefact | null
  /** The player sections; omitted while none is registered. */
  slices?: PortableSections
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
          artefact: player.artefact === null ? null : { ...player.artefact },
          ...portableSectionsOf(player.slices, 'player'),
        },
      ]),
    ),
    world: portableWorldOf(state.world),
    platform: copyPlatform(state.platform),
    core: { ...state.core },
    combat: portableCombatOf(state.combat),
    collapse: portableCollapseOf(state.collapse),
    lava: portableLavaOf(state.lava),
    liveBlasts: portableLiveBlastsOf(state.liveBlasts),
    terrainEdits: portableTerrainEditsOf(state.terrainEdits),
    debugApplied: state.debugApplied,
    ...portableSectionsOf(state.slices, 'session'),
  }
}

export type SnapshotRestore = { state: AuthorityState; problems: [] } | { problems: string[] }

export function readSnapshot(snapshot: unknown): SnapshotRestore {
  const problems = snapshotProblems(snapshot)
  if (problems.length > 0) return { problems }
  return verifiedRestore(snapshot as SessionSnapshot)
}

/**
 * The registered sections a snapshot `readSnapshot` accepted lacks, which it restored at their
 * initial values: each id once, sorted, across the session and every player.
 */
export function sectionsRestoredBy(snapshot: SessionSnapshot): string[] {
  const players = Object.values(snapshot.state.players)
  const missing = [
    ...missingSectionIdsOf(snapshot.state.slices, 'session'),
    ...players.flatMap((player) => missingSectionIdsOf(player.slices, 'player')),
  ]
  return [...new Set(missing)].sort()
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
    platform: copyPlatform(portable.platform),
    core: { ...portable.core },
    combat: combatOfPortable(portable.combat),
    collapse: portableCollapseOf(portable.collapse),
    lava: portableLavaOf(portable.lava),
    liveBlasts: portableLiveBlastsOf(portable.liveBlasts),
    terrainEdits: portableTerrainEditsOf(portable.terrainEdits),
    debugApplied: portable.debugApplied,
    ...sectionsOfPortable(portable.slices, 'session'),
  }
}

function playerStateOf(player: PortablePlayer): PlayerState {
  return {
    wallet: fromCanonical(player.wallet),
    lastSeq: player.lastSeq,
    vehicle: vehicleOfPortable(player.vehicle),
    artefact: player.artefact === null ? null : { ...player.artefact },
    ...sectionsOfPortable(player.slices, 'player'),
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
    ...coreProgressProblems(state.core, 'snapshot.state.core'),
    ...portableCombatProblems(state.combat, 'snapshot.state.combat'),
    ...portableCollapseProblems(state.collapse, 'snapshot.state.collapse'),
    ...portableLavaProblems(state.lava, 'snapshot.state.lava'),
    ...portableLiveBlastsProblems(state.liveBlasts, 'snapshot.state.liveBlasts'),
    ...portableTerrainEditsProblems(state.terrainEdits, 'snapshot.state.terrainEdits'),
    ...(typeof state.debugApplied === 'boolean'
      ? []
      : ['snapshot.state.debugApplied must be a boolean']),
    ...portableSectionsProblems(state.slices, 'session', 'snapshot.state'),
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
  if (!isValid) return ['snapshot.state.platform must hold a whole coreBay and a visual state']
  return refinerySlotsProblems(platform.refinerySlots, 'snapshot.state.platform.refinerySlots')
}

function copyPlatform(platform: PlatformState): PlatformState {
  return { ...platform, refinerySlots: copyRefinerySlots(platform.refinerySlots) }
}

function playersProblems(players: unknown): string[] {
  if (!isJsonObject(players)) return ['snapshot.state.players must be an object']
  return Object.entries(players).flatMap(([id, player]) => portablePlayerProblems(id, player))
}

function portablePlayerProblems(id: string, player: unknown): string[] {
  const path = `snapshot.state.players.${id}`
  if (!isPortablePlayer(player)) return [`${path} must hold a money wallet and a whole lastSeq`]
  return [
    ...portableVehicleProblems(player.vehicle, `${path}.vehicle`),
    ...heldArtefactProblems(player.artefact, `${path}.artefact`),
    ...portableSectionsProblems(player.slices, 'player', path),
  ]
}

function isPortablePlayer(player: unknown): player is Record<string, unknown> {
  return (
    isJsonObject(player) && isNonNegativeMoneyText(player.wallet) && isWholeNumber(player.lastSeq)
  )
}
