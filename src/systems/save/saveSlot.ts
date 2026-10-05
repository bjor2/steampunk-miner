/**
 * The checkpoint save file (decisions #4 and #12, amended by #12 to one file per slot; #26):
 *
 *   header   formatVersion, snapshotVersion, generatorVersion, saveEpoch, tick, digest
 *   world    the planet as seed + params + chunk deltas, the platform, the core and combat
 *   profile  per player the wallet, the last seq and the vehicle (integer levels, never stats)
 *
 * Both sections carry the header's `saveEpoch`, so a world can never be paired with a profile
 * from another write; they stay separately addressable so co-op can split them into two files.
 * The sections are cut from the session snapshot (#11 section 5) and joined back into one before
 * `readSnapshot`, so the debug API, the save and the co-op join share one serialiser.
 *
 * Reading refuses, never migrates: another format, snapshot or generator version, a mismatched
 * epoch, planet params this build would not generate, or anything `readSnapshot` refuses is a
 * listed problem, and nothing is restored.
 */
import type { AuthorityState } from '../authority/authorityState'
import { isJsonObject, isWholeNumber } from '../authority/payloadFields'
import { planetParamsOf } from '../authority/planetOfState'
import {
  readSnapshot,
  SNAPSHOT_VERSION,
  type PortablePlayer,
  type PortableState,
  type SessionSnapshot,
} from '../authority/sessionSnapshot'
import { GENERATOR_VERSION } from '../generatorVersion'
import type { PlanetParams } from '../world/planetParams'

/** 1: the first checkpoint layout (#26). */
export const SAVE_FORMAT_VERSION = 1

/** The slice has one slot and no slot picker (#12: one file per slot). */
export const CHECKPOINT_SLOT = 1

export interface SaveSlotFile {
  formatVersion: number
  snapshotVersion: number
  generatorVersion: number
  saveEpoch: number
  tick: number
  /** The state digest of the snapshot the sections were cut from (#11 section 3). */
  digest: string
  world: SaveWorldSection
  profile: SaveProfileSection
}

export interface SaveWorldSection {
  saveEpoch: number
  worldSeed: number
  planetIndex: number
  /** The params the planet was generated with; a build that would generate others refuses. */
  params: PlanetParams | null
  chunks: PortableState['world']['chunks']
  tileWork: PortableState['world']['tileWork']
  platform: PortableState['platform']
  core: PortableState['core']
  combat: PortableState['combat']
  debugApplied: boolean
}

export interface SaveProfileSection {
  saveEpoch: number
  players: Record<string, PortablePlayer>
}

export type SaveSlotReading =
  { state: AuthorityState; saveEpoch: number; problems: [] } | { problems: string[] }

export function saveSlotOf(snapshot: SessionSnapshot, saveEpoch: number): SaveSlotFile {
  return {
    formatVersion: SAVE_FORMAT_VERSION,
    snapshotVersion: snapshot.snapshotVersion,
    generatorVersion: snapshot.generatorVersion,
    saveEpoch,
    tick: snapshot.tick,
    digest: snapshot.digest,
    world: worldSectionOf(snapshot.state, saveEpoch),
    profile: { saveEpoch, players: snapshot.state.players },
  }
}

function worldSectionOf(state: PortableState, saveEpoch: number): SaveWorldSection {
  return {
    saveEpoch,
    worldSeed: state.planet.seed,
    planetIndex: state.planet.index,
    params: planetParamsOf(state.planet),
    chunks: state.world.chunks,
    tileWork: state.world.tileWork,
    platform: state.platform,
    core: state.core,
    combat: state.combat,
    debugApplied: state.debugApplied,
  }
}

/**
 * A file of another version is refused on its header alone: its sections may have another shape,
 * so listing their problems against this build's rules would only add noise.
 */
export function readSaveSlot(file: unknown): SaveSlotReading {
  const problems = headerProblems(file)
  if (problems.length > 0) return { problems }
  return restoreSections(file as SaveSlotFile)
}

function restoreSections(file: SaveSlotFile): SaveSlotReading {
  const restored = readSnapshot(snapshotOfSaveSlot(file))
  const problems = [...paramsProblems(file.world), ...restored.problems]
  if (problems.length > 0 || !('state' in restored)) return { problems }
  return { state: restored.state, saveEpoch: file.saveEpoch, problems: [] }
}

function snapshotOfSaveSlot(file: SaveSlotFile): SessionSnapshot {
  const { world, profile } = file
  return {
    snapshotVersion: file.snapshotVersion,
    generatorVersion: file.generatorVersion,
    tick: file.tick,
    digest: file.digest,
    state: {
      tick: file.tick,
      planet: { index: world.planetIndex, seed: world.worldSeed },
      players: profile.players,
      world: { chunks: world.chunks, tileWork: world.tileWork },
      platform: world.platform,
      core: world.core,
      combat: world.combat,
      debugApplied: world.debugApplied,
    },
  }
}

function headerProblems(file: unknown): string[] {
  if (!isJsonObject(file)) return ['save must be an object']
  return [
    ...versionProblems('formatVersion', file.formatVersion, SAVE_FORMAT_VERSION),
    ...versionProblems('snapshotVersion', file.snapshotVersion, SNAPSHOT_VERSION),
    ...versionProblems('generatorVersion', file.generatorVersion, GENERATOR_VERSION),
    ...(isWholeNumber(file.saveEpoch) ? [] : ['save.saveEpoch must be a whole number']),
    ...sectionProblems('world', file.world, file.saveEpoch),
    ...sectionProblems('profile', file.profile, file.saveEpoch),
  ]
}

function versionProblems(name: string, version: unknown, expected: number): string[] {
  if (version === expected) return []
  return [`save.${name} is ${JSON.stringify(version)}, this build reads ${expected}`]
}

function sectionProblems(name: string, section: unknown, saveEpoch: unknown): string[] {
  if (!isJsonObject(section)) return [`save.${name} must be an object`]
  if (section.saveEpoch === saveEpoch) return []
  return [
    `save.${name}.saveEpoch is ${JSON.stringify(section.saveEpoch)}, the save's is ${JSON.stringify(saveEpoch)}`,
  ]
}

/** Params are a pure function of seed and index, so a difference means another generator. */
function paramsProblems(world: SaveWorldSection): string[] {
  const generated = planetParamsOf({ index: world.planetIndex, seed: world.worldSeed })
  if (JSON.stringify(world.params) === JSON.stringify(generated)) return []
  return ['save.world.params differ from the params this build generates for its seed and planet']
}
