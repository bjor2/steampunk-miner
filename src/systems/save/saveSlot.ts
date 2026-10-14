/**
 * The checkpoint save file (decisions #4 and #12, amended by #12 to one file per slot; #26):
 *
 *   header   formatVersion, slot (name and wall time, #401), snapshotVersion, generatorVersion,
 *            saveEpoch, tick, digest, and the open unlock ids (`savedUnlocks.ts`, #401)
 *   world    the planet as seed + params + chunk deltas, the platform, the core, combat, the
 *            blocks warning or refilling (#43), loose lava (#113), live blasts and queued power-up terrain edits (K6 #189)
 *   profile  per player the wallet, the last seq and the vehicle (integer levels, never stats)
 *
 * The slices' save sections ride inside these two parts (feature-slices.md 3.13): the session
 * sections as `world.slices`, the player sections in each profile player, both omitted while none
 * is registered, so neither the header nor `SAVE_FORMAT_VERSION` changes for them.
 *
 * Both sections carry the header's `saveEpoch`, so a world can never be paired with a profile
 * from another write; they stay separately addressable so co-op can split them into two files.
 * The sections are cut from the session snapshot (#11 section 5) and joined back into one before
 * `readSnapshot`, so the debug API, the save and the co-op join share one serialiser.
 *
 * Reading refuses, never migrates: another format, snapshot or generator version, a mismatched
 * epoch, planet params this build would not generate, or anything `readSnapshot` refuses is a
 * listed problem, and nothing is restored. Older saves reach this reader through the migration
 * chain first (`saveMigrations.ts`, #170). Which slot a file sits in is the shell's; the slot
 * index (`saveSlotIndex.ts`) reads its entry off this header.
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
import { slotMetaProblems, UNTIMED_AUTOSAVE, type SaveSlotMeta } from './saveSlotIndex'
import { unlocksOnLoad, unlocksToSave } from './savedUnlocks'

/**
 * 1: the first checkpoint layout (#26), one slot.
 * 2: slots (#401): the header adds the slot's name and wall time and the open unlock ids.
 */
export const SAVE_FORMAT_VERSION = 2

/** What every format version holds: the session cut into its world and profile (all of v1). */
export interface SaveSections {
  snapshotVersion: number
  generatorVersion: number
  saveEpoch: number
  tick: number
  /** The state digest of the snapshot the sections were cut from (#11 section 3). */
  digest: string
  world: SaveWorldSection
  profile: SaveProfileSection
}

export interface SaveSlotFile extends SaveSections {
  formatVersion: number
  slot: SaveSlotMeta
  /** The ids of the schedule rows open when it was written: the host world's (#401). */
  unlocked: string[]
}

export interface SaveWorldSection {
  saveEpoch: number
  worldSeed: number
  planetIndex: number
  /** The params the planet was generated with; a build that would generate others refuses. */
  params: PlanetParams | null
  chunks: PortableState['world']['chunks']
  platform: PortableState['platform']
  core: PortableState['core']
  combat: PortableState['combat']
  collapse: PortableState['collapse']
  lava: PortableState['lava']
  liveBlasts: PortableState['liveBlasts']
  terrainEdits: PortableState['terrainEdits']
  debugApplied: boolean
  /** The session sections; omitted while none is registered. */
  slices?: PortableState['slices']
}

export interface SaveProfileSection {
  saveEpoch: number
  players: Record<string, PortablePlayer>
}

export type SaveSlotReading =
  | { state: AuthorityState; saveEpoch: number; unlocked: string[]; problems: [] }
  | { problems: string[] }

export function saveSlotOf(
  snapshot: SessionSnapshot,
  saveEpoch: number,
  slot: SaveSlotMeta = UNTIMED_AUTOSAVE,
): SaveSlotFile {
  const { world, profile, ...header } = saveSectionsOf(snapshot, saveEpoch)
  const unlocked = unlocksToSave(snapshot.state)
  return { formatVersion: SAVE_FORMAT_VERSION, slot, ...header, unlocked, world, profile }
}

/** The sections alone: what a migration step re-cuts, keeping the rest of the file's header. */
export function saveSectionsOf(snapshot: SessionSnapshot, saveEpoch: number): SaveSections {
  return {
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
    platform: state.platform,
    core: state.core,
    combat: state.combat,
    collapse: state.collapse,
    lava: state.lava,
    liveBlasts: state.liveBlasts,
    terrainEdits: state.terrainEdits,
    debugApplied: state.debugApplied,
    ...(state.slices === undefined ? {} : { slices: state.slices }),
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
  const unlocked = unlocksOnLoad(file.unlocked, restored.state)
  return { state: restored.state, saveEpoch: file.saveEpoch, unlocked, problems: [] }
}

/** The session snapshot the sections were cut from, joined back into one. */
export function snapshotOfSaveSlot(file: SaveSections): SessionSnapshot {
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
      world: { chunks: world.chunks },
      platform: world.platform,
      core: world.core,
      combat: world.combat,
      collapse: world.collapse,
      lava: world.lava,
      liveBlasts: world.liveBlasts,
      terrainEdits: world.terrainEdits,
      debugApplied: world.debugApplied,
      ...(world.slices === undefined ? {} : { slices: world.slices }),
    },
  }
}

function headerProblems(file: unknown): string[] {
  if (!isJsonObject(file)) return ['save must be an object']
  return [
    ...versionProblems('formatVersion', file.formatVersion, SAVE_FORMAT_VERSION),
    ...versionProblems('snapshotVersion', file.snapshotVersion, SNAPSHOT_VERSION),
    ...versionProblems('generatorVersion', file.generatorVersion, GENERATOR_VERSION),
    ...slotHeaderProblems(file),
    ...(isWholeNumber(file.saveEpoch) ? [] : ['save.saveEpoch must be a whole number']),
    ...sectionProblems('world', file.world, file.saveEpoch),
    ...sectionProblems('profile', file.profile, file.saveEpoch),
  ]
}

/** Only a file of this format is held to its fields: another one is refused on its version. */
function slotHeaderProblems(file: Record<string, unknown>): string[] {
  if (file.formatVersion !== SAVE_FORMAT_VERSION) return []
  return [...slotMetaProblems(file.slot), ...unlockedProblems(file.unlocked)]
}

function unlockedProblems(unlocked: unknown): string[] {
  const isTextList = Array.isArray(unlocked) && unlocked.every((id) => typeof id === 'string')
  return isTextList ? [] : ['save.unlocked must be a list of row ids']
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
