/**
 * The checkpoint save file (decisions #4 and #12, amended by #12 to one file per slot; #26):
 *
 *   header   formatVersion, slot (name and wall time, #401), snapshotVersion, generatorVersion,
 *            saveEpoch, tick, digest, and the open unlock ids (`savedUnlocks.ts`, #401)
 *   world    the planet as seed + params + the deltas of the chunks play changed, packed into one
 *            table (`packedChunks.ts`, #401 VS2), the platform, the core, combat, the blocks
 *            warning or refilling (#43), loose lava (#113), live blasts and queued power-up terrain
 *            edits (K6 #189), and the bore gun's pending shots, standing struts and grounded lines
 *            while there are any (tickets 313, 379, 378; carried since ticket 405, so a save taken
 *            mid-bore restores)
 *   profile  per player the wallet, the last seq and the vehicle (integer levels, never stats):
 *            the world's progress for each of its players, owned by the host (#401, ticket 407).
 *            The key keeps its format 1 name; the player's own profile, which carries only
 *            settings and cosmetics between worlds, is `playerProfile.ts` and never in a save.
 *
 * The slices' save sections ride inside these two parts (feature-slices.md 3.13): the session
 * sections as `world.slices`, the player sections in each profile player, both omitted while none
 * is registered, so neither the header nor `SAVE_FORMAT_VERSION` changes for them.
 *
 * Both sections carry the header's `saveEpoch`, so a world can never be paired with players from
 * another write. #3 and #12 kept them apart for a co-op split into two files; since #401 both are
 * the host's world save, so they stay in one file (`worldSaveOwnership.ts`).
 * The sections are cut from the session snapshot (#11 section 5) and joined back into one before
 * `readSnapshot`, so the debug API, the save and the co-op join share one serialiser.
 *
 * The sections are packed only on the file: `SaveSections` is what every format holds, with the
 * deltas as they stand in the state, and `sectionsOfSaveSlot` unpacks a file back into them.
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
  boreFieldsOf,
  oreRulesFieldOf,
  planetOfWorld,
  type WorldSectionPlanet,
} from './worldSectionFields'
import {
  readSnapshot,
  SNAPSHOT_VERSION,
  type PortablePlayer,
  type PortableState,
  type SessionSnapshot,
} from '../authority/sessionSnapshot'
import { devFlagFieldsOf } from '../authority/devFlagState'
import { GENERATOR_VERSION } from '../generatorVersion'
import type { PlanetParams } from '../world/planetParams'
import { packChunkDeltas, unpackChunkDeltas, type PackedChunks } from './packedChunks'
import { slotMetaProblems, UNTIMED_AUTOSAVE, type SaveSlotMeta } from './saveSlotIndex'
import { unlocksOnLoad, unlocksToSave } from './savedUnlocks'

/**
 * 1: the first checkpoint layout (#26), one slot.
 * 2: slots (#401): the header adds the slot's name and wall time and the open unlock ids.
 * 3: the chunk deltas packed into one table (#401 VS2).
 */
export const SAVE_FORMAT_VERSION = 3

/** What every format version holds: the session cut into its world and profile (all of v1). */
export interface SaveSections {
  snapshotVersion: number
  generatorVersion: number
  saveEpoch: number
  tick: number
  /** The state digest of the snapshot the sections were cut from (#11 section 3). */
  digest: string
  world: SaveWorldSection
  profile: SavePlayersSection
}

export interface SaveSlotFile extends Omit<SaveSections, 'world'> {
  formatVersion: number
  slot: SaveSlotMeta
  /** The ids of the schedule rows open when it was written: the host world's (#401). */
  unlocked: string[]
  world: SavedWorldSection
}

/** The world section as the file holds it: its chunk deltas packed (#401 VS2). */
export interface SavedWorldSection extends Omit<SaveWorldSection, 'chunks'> {
  chunks: PackedChunks
}

export interface SaveWorldSection extends WorldSectionPlanet {
  saveEpoch: number
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
  /** The bore gun's pending shots (ticket 313); omitted while there are none. */
  bores?: PortableState['bores']
  /** The standing struts (ticket 379); omitted while there are none. */
  struts?: PortableState['struts']
  /** The grounded bore lines (ticket 378); omitted while there are none. */
  groundedLines?: PortableState['groundedLines']
  debugApplied: boolean
  /** The dev flags off their defaults, so the world runs as it ran (ticket 547); omitted while none is. */
  devFlagDelta?: PortableState['devFlagDelta']
  /** The sticky taint: a save made under `debug.setFlags` is marked (ticket 547); omitted before. */
  devFlagsEverSet?: PortableState['devFlagsEverSet']
  /** The session sections; omitted while none is registered. */
  slices?: PortableState['slices']
}

/** The world's players and their progress: the host's, never a player profile (ticket 407). */
export interface SavePlayersSection {
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
  return {
    formatVersion: SAVE_FORMAT_VERSION,
    slot,
    ...header,
    unlocked,
    world: packedWorldOf(world),
    profile,
  }
}

/** The world section with its chunk deltas packed, every other field as it is. */
export function packedWorldOf(world: SaveWorldSection): SavedWorldSection {
  return { ...world, chunks: packChunkDeltas(world.chunks) }
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
    ...oreRulesFieldOf(state.planet),
    params: planetParamsOf(state.planet),
    chunks: state.world.chunks,
    platform: state.platform,
    core: state.core,
    combat: state.combat,
    collapse: state.collapse,
    lava: state.lava,
    liveBlasts: state.liveBlasts,
    terrainEdits: state.terrainEdits,
    ...boreFieldsOf(state),
    debugApplied: state.debugApplied,
    ...devFlagFieldsOf(state),
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
  const unpacked = sectionsOfSaveSlot(file)
  if (!('sections' in unpacked)) return unpacked
  return restoreUnpackedSections(file, unpacked.sections)
}

function restoreUnpackedSections(file: SaveSlotFile, sections: SaveSections): SaveSlotReading {
  const restored = readSnapshot(snapshotOfSaveSlot(sections))
  const problems = [...paramsProblems(sections.world), ...restored.problems]
  if (problems.length > 0 || !('state' in restored)) return { problems }
  const unlocked = unlocksOnLoad(file.unlocked, restored.state)
  return { state: restored.state, saveEpoch: file.saveEpoch, unlocked, problems: [] }
}

/** The sections of a file of this format, its chunk deltas unpacked, or why they cannot be. */
export function sectionsOfSaveSlot(
  file: SaveSlotFile,
): { sections: SaveSections; problems: [] } | { problems: string[] } {
  const unpacking = unpackChunkDeltas(file.world.chunks)
  if (!('chunks' in unpacking)) return unpacking
  return { sections: sectionsWithChunks(file, unpacking.chunks), problems: [] }
}

function sectionsWithChunks(file: SaveSlotFile, chunks: SaveWorldSection['chunks']): SaveSections {
  return {
    snapshotVersion: file.snapshotVersion,
    generatorVersion: file.generatorVersion,
    saveEpoch: file.saveEpoch,
    tick: file.tick,
    digest: file.digest,
    world: { ...file.world, chunks },
    profile: file.profile,
  }
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
      planet: planetOfWorld(world),
      players: profile.players,
      world: { chunks: world.chunks },
      platform: world.platform,
      core: world.core,
      combat: world.combat,
      collapse: world.collapse,
      lava: world.lava,
      liveBlasts: world.liveBlasts,
      terrainEdits: world.terrainEdits,
      ...boreFieldsOf(world),
      debugApplied: world.debugApplied,
      ...devFlagFieldsOf(world),
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
  const generated = planetParamsOf(planetOfWorld(world))
  if (JSON.stringify(world.params) === JSON.stringify(generated)) return []
  return ['save.world.params differ from the params this build generates for its seed and planet']
}
