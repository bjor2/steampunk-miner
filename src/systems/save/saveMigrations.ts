/**
 * The save migration chain (Producer call and TD save chain on #170): a save from an older build
 * loads through an ordered list of steps, one per version bump, each moving one header version up
 * by one, before the header check. Steps that reshape the snapshot come first: they move the raw
 * file, and every later step restores it through this build's reader. A file no step fits is left
 * as it is, so `readSaveSlot` refuses it with its version problems, as before. Each step that ran is reported, and the checkpoint logs
 * one `save_migrated {version, from, to}` line per step.
 *
 * Snapshot 18 -> 19 (#180 section 3, TD on the migration rows, #181): a track's level and the
 * guns' level become steps, `L -> 10L`, so prices and stats are the same at every major boundary.
 * The old digest must hold over the state as saved, so a corrupt file is still refused; the charge
 * rack (whole slots) and the casing grade (a gate) stay single-tier and are not touched. Wallet,
 * items, codex and everything else are kept, and the digest is taken again.
 *
 * Snapshot 19 -> 20 (K8 #218): the charge racks by size (`sizedChargeRacks.ts`); the old digest
 * must hold over the old state, and the reshaped one is digested afresh.
 *
 * Snapshot 20 -> 21 (ticket 399): the swept cut's cursor gains its carried work at 0
 * (`carriedCursors.ts`), as 19 -> 20 checks and digests; a save with no cursor keeps its state.
 *
 * Snapshot 21 -> 22 (ticket 755, the star map): a save from before it is in system 1, the planet
 * line it was played on, with every fuel tank empty. Both are the absent keys of this build, so the
 * old digest is checked and the state is kept as saved; only the header moves, and a build from
 * before the star map refuses a save that holds a system or fuel it would drop.
 *
 * Snapshot 22 -> 23 (ticket 756, the fuel tank track): a save from before it holds the starting
 * tank, level 1, the absent key of this build, so the old digest is checked and the state is kept as
 * saved; a build from before the tank refuses a save that holds a level it would drop.
 *
 * Snapshot 23 -> 24 (ticket 759, the jump drive): a save from before it holds no drive, the absent
 * key of this build, so the old digest is checked and the state is kept as saved; a build from
 * before the drive refuses a save that holds one it would drop.
 *
 * Snapshot 24 -> 25 (ticket 790, the core bay of each planet): a save from before it holds one bay,
 * read as the bay of the planet it was saved on, its `s:p`, with no other planet banked: the absent
 * key of this build. So the old digest is checked and the state is kept as saved; a build from
 * before the per-planet bay refuses a save that holds a left planet's bay it would drop.
 *
 * Snapshot 25 -> 26 (ticket 791, the drill's aim): a save from before it holds no aim, each pose
 * and cursor aiming at its facing: the absent key of this build. So the old digest is checked and
 * the state is kept as saved; a build from before the aim refuses a save that holds one.
 *
 * Snapshot 26 -> 27 (ticket 844, the premium ledger): a save from before it counts no premium
 * unit, the absent key of this build. So the old digest is checked and the state is kept as saved;
 * a build from before the ledger refuses a save that holds counts it would drop.
 *
 * Snapshot 27 -> 28 (ticket 849, the bignum hold): a save from before it holds every count of the
 * hold, of a Refinery batch and of a Cache Crate as a safe integer, which is this build's spelling
 * of a count below 2^53. So the old digest is checked and the state is kept as saved; a build from
 * before the bignum hold refuses a save that holds a count past 2^53 it could not read.
 * Snapshot 28 -> 29 (ticket 860, the blast's disc record): a live blast saved mid-crater gains the
 * Blast Radius level every planter then owned, 0, and its `blastSeq` in the order it went live, and
 * the session's counter starts past them (`numberedBlasts.ts`), so the crater a reload finishes is
 * the one it would have been. The rack is kept as saved: the 12-row ladder keeps sizes 1 to 10
 * as they were, so every owned charge is the same row.
 *
 * Snapshot 29 -> 30 (ticket 888, the ore rules stamp of each planet): a save from before it keeps no
 * left planet's stamp, the absent key of this build, so the old digest is checked and the state is
 * kept as saved. A left planet with a saved core bay then lands as the build before the generated
 * pools made it, and the planet the save is on keeps its own stamp; a build from before the stamps
 * refuses a save that holds one it would drop.
 *
 * Generator 5 -> 6 (#175): the pad grew to -8..+12 under the two shop buildings, so the chunk edits
 * of every chunk the old or new pad and its cleared air touch are dropped and regenerate under the
 * new stamp, every vehicle is put on the Sell bay's rest pose, and the params are recomputed from
 * seed and index. Wallet, levels, owned items and everything else in the state are kept.
 *
 * Generator 6 -> 7 (#146): each ore patch rolls its rarity lead, which changes only the tier of
 * generated ore cells. A chunk delta holds what was dug, yielded, lined or flooded, never a
 * generated material cell, so every edit stays as it is and the ore no one has mined yet reads its
 * lead. The whole state is kept.
 *
 * Generator 7 -> 8 (#147): each ore patch from planet 3 wears its planet's family mix and
 * signature, which changes only the family of generated ore cells; as for 6 -> 7, every edit and
 * the whole state are kept.
 *
 * Generator 8 -> 9 (ticket 445): a planet entered under the ore rules rolls the rarity rows. A save
 * written before them holds its planet without `oreRulesVersion`, so that planet keeps the legacy
 * rows and every cell no one has dug reads as it did; every edit and the whole state are kept, and
 * the next planet the player enters is stamped.
 *
 * Generator 9 -> 10 (ticket 446): a planet entered under ore rules 2 draws a material kind per ore
 * patch into the cell's kind slot. A save written before them holds its planet unstamped or under
 * rules 1, so that planet draws no kind and every cell no one has dug reads as it did; every edit
 * and the whole state are kept, and the next planet the player enters is stamped with rules 2.
 *
 * Generator 10 -> 11 (ticket 448): a planet entered under ore rules 3 from planet 3 thins its ore
 * patches to the depth density curve. A save written before them holds its planet under rules 2 or
 * earlier, so that planet keeps the step bands and every cell no one has dug reads as it did; every
 * edit and the whole state are kept, and the next planet from planet 3 is stamped with rules 3.
 *
 * Generator 11 -> 12 (ticket 625): rock on a planet entered under ore rules 5 from planet 2 is
 * pinned at the surface and ramps to band 1 (`world/surfaceLayer.ts`). A save written before it
 * holds its planet under rules 4 or earlier, so that planet keeps the shipped band hardness and
 * never regenerates mid-run; every cell, edit and the whole state are kept, and the next planet
 * from planet 2 is stamped with rules 5.
 *
 * Generator 12 -> 13 (ticket 643): a planet entered under ore rules 7 from planet 2 takes its
 * radius from the planet registry, and its core, bands and band-placed content with it. A save
 * written before it holds its planet under rules 6 or earlier, so that planet keeps #6's ladder
 * radius and never regenerates mid-run; every cell, edit and the whole state are kept, and the next
 * planet from planet 2 is stamped with rules 7.
 *
 * Generator 13 -> 14 (ticket 709): planet 2 entered under ore rules 9 draws its three own kinds on
 * the uncommon and rare patches of bands 4 and 5. A save written before it holds its planet under
 * rules 8 or earlier, so that planet keeps the 12 species it was entered with and never regenerates
 * mid-run; every cell, edit and the whole state are kept, and the next planet from planet 2 is
 * stamped with rules 9.
 *
 * Generator 14 -> 15 (ticket 737): every planet entered under ore rules 10 grows its rare, epic and
 * mythic ore as clusters of 1 to 3 cells and holds one guaranteed cluster of each rare kind. A save
 * written before it holds its planet under rules 9 or earlier, so that planet keeps its whole rare
 * patches and never regenerates mid-run; every cell, edit and the whole state are kept, and the
 * next planet is stamped with rules 10.
 *
 * Generator 15 -> 16 (ticket 738): a planet from P3 entered under ore rules 11 draws its rare, epic
 * and mythic ore only from band 3. A save written before it holds its planet under rules 10 or
 * earlier, so that planet keeps its band-2 rares and never regenerates mid-run; every cell, edit and
 * the whole state are kept, and the next planet from P3 is stamped with rules 11.
 *
 * Generator 16 -> 17 (ticket 713): planet 1 entered under ore rules 12 draws its three gems, Diamond,
 * Emerald and Ruby, on its crystal rare patches of bands 3 to 5 and holds a guaranteed cluster of
 * each. A save written before it holds its planet under rules 11 or earlier, so that planet keeps
 * its 12 species and never regenerates mid-run; every cell, edit and the whole state are kept, and
 * the next planet is stamped with rules 12.
 *
 * Generator 17 -> 18 (ticket 888): every planet after system 1's P5 entered under ore rules 14 draws
 * its kinds from its generated material pool. A save written before it holds its planet under
 * rules 13 or earlier, so that planet keeps the pool it was entered with (`foothold-p6-p7` on P6
 * and P7, none from P8) and never regenerates mid-run; every cell, edit and the whole state are
 * kept, and the next planet the player first enters from P6 is stamped with rules 14.
 *
 * Format 1 -> 2 (#401): the slot layout. A v1 file was the checkpoint of the single slot, so it
 * becomes the autosave with no wall time, and its header gains the ids of the rows its state opens
 * (`savedUnlocks.ts`). Its sections are kept byte for byte: money, levels and everything else.
 * The shell moves the file itself into the autosave slot (`store/saveSlotLayout.ts`).
 *
 * Format 2 -> 3 (#401 VS2): the chunk deltas packed into one table (`packedChunks.ts`). Every delta
 * is kept as it is, in its order, so the digest holds and every other field is untouched.
 *
 * A save from before every bump reads at snapshot 18 and generator 5: the snapshot steps run
 * first, as the TD's save chain orders them, so the generator steps restore the state with this
 * build's reader, and the format steps, last, read it whole. A step that meets a packed file (a
 * later bump on a format-3 save) reads its deltas unpacked and packs them again when it re-cuts. A step that re-cuts the sections
 * keeps the rest of the file's header (`withSectionsOf`), whatever its format.
 *
 * A registered slice section the save lacks is no step: `readSnapshot` restores it at its initial
 * value, and the reading reports it after the steps as one `save_migrated {restoredSections}` (#224).
 */
import type { AuthorityState } from '../authority/authorityState'
import {
  readSnapshot,
  reshapedSnapshot,
  sectionsRestoredBy,
  takeSnapshot,
  type PortablePlayer,
  type PortableState,
  type SessionSnapshot,
} from '../authority/sessionSnapshot'
import { refineryUnlockPlanet } from '../economy/refineryEconomy'
import { stepsOfMajors, stepOfMajor } from '../economy/upgradeSteps'
import { GENERATOR_VERSION } from '../generatorVersion'
import { dockedPoseAt } from '../vehicle/vehiclePose'
import { dockSiteOf, type DockSite } from '../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { chunkKey, chunkOfTile, surfaceRowOfColumn } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import { portableWorldProblems } from '../authority/vehicleSnapshot'
import {
  packedWorldOf,
  readSaveSlot,
  saveSectionsOf,
  sectionsOfSaveSlot,
  snapshotOfSaveSlot,
  type SaveSections,
  type SaveSlotFile,
  type SaveSlotReading,
} from './saveSlot'
import { UNTIMED_AUTOSAVE } from './saveSlotIndex'
import { unlocksToSave } from './savedUnlocks'
import { withCarriedCursors } from './carriedCursors'
import { withNumberedBlasts } from './numberedBlasts'
import { withSizedChargeRacks } from './sizedChargeRacks'

/** The header version a step moves on. */
export type MigratedVersion = 'snapshotVersion' | 'generatorVersion' | 'formatVersion'

/** A file before format 3: the sections every version holds, the chunk deltas as they stand. */
type UnpackedFile = SaveSections & { formatVersion: number }

/** A file at any format version, the rest of its header kept. */
type MigratingFile = UnpackedFile | SaveSlotFile

/** A format-2 file: the slot header around the sections, the chunk deltas as they stand. */
type SlottedFile = UnpackedFile & Pick<SaveSlotFile, 'slot' | 'unlocked'>

/** The first format whose chunk deltas are packed (#401 VS2). */
const FIRST_PACKED_FORMAT = 3

/** One step that ran: `save_migrated {version, from, to}`. */
export interface HeaderVersionStep {
  version: MigratedVersion
  from: number
  to: number
}

/** The registered sections the save lacked, restored at initial: `save_migrated {restoredSections}`. */
export interface SectionRestore {
  restoredSections: readonly { section: string }[]
}

export type SaveMigration = HeaderVersionStep | SectionRestore

interface SaveMigrationStep extends HeaderVersionStep {
  /** The migrated file, or null when the file cannot be read at `from` (then nothing more runs). */
  migrate(file: MigratingFile): MigratingFile | null
}

/** The chain in the order a save written before every bump needs them (see the module comment). */
const SAVE_MIGRATION_STEPS: readonly SaveMigrationStep[] = [
  { version: 'snapshotVersion', from: 18, to: 19, migrate: levelsToSteps },
  { version: 'snapshotVersion', from: 19, to: 20, migrate: sizeChargeRacks },
  { version: 'snapshotVersion', from: 20, to: 21, migrate: carryOnCursors },
  { version: 'snapshotVersion', from: 21, to: 22, migrate: placeInFirstSystem },
  { version: 'snapshotVersion', from: 22, to: 23, migrate: keepStartingTanks },
  { version: 'snapshotVersion', from: 23, to: 24, migrate: keepVehiclesWithoutDrive },
  { version: 'snapshotVersion', from: 24, to: 25, migrate: keepBayOnSavedPlanet },
  { version: 'snapshotVersion', from: 25, to: 26, migrate: keepFacingsAsAims },
  { version: 'snapshotVersion', from: 26, to: 27, migrate: keepHoldsWithoutPremium },
  { version: 'snapshotVersion', from: 27, to: 28, migrate: keepSafeHoldCounts },
  { version: 'snapshotVersion', from: 28, to: 29, migrate: numberLiveBlasts },
  { version: 'snapshotVersion', from: 29, to: 30, migrate: keepPlanetsWithoutStamps },
  { version: 'generatorVersion', from: 5, to: 6, migrate: regeneratePadArea },
  { version: 'generatorVersion', from: 6, to: 7, migrate: keepEditsUnderOreLeads },
  { version: 'generatorVersion', from: 7, to: 8, migrate: keepEditsUnderOreMix },
  { version: 'generatorVersion', from: 8, to: 9, migrate: keepLegacyOreRows },
  { version: 'generatorVersion', from: 9, to: 10, migrate: keepCellsWithoutRoster },
  { version: 'generatorVersion', from: 10, to: 11, migrate: keepStepBandDensity },
  { version: 'generatorVersion', from: 11, to: 12, migrate: keepShippedSurface },
  { version: 'generatorVersion', from: 12, to: 13, migrate: keepLadderRadius },
  { version: 'generatorVersion', from: 13, to: 14, migrate: keepTwelveSpecies },
  { version: 'generatorVersion', from: 14, to: 15, migrate: keepRarePatches },
  { version: 'generatorVersion', from: 15, to: 16, migrate: keepBandTwoRares },
  { version: 'generatorVersion', from: 16, to: 17, migrate: keepPlanetOneWithoutGems },
  { version: 'generatorVersion', from: 17, to: 18, migrate: keepPlanetsWithoutPools },
  { version: 'formatVersion', from: 1, to: 2, migrate: addSlotHeader },
  { version: 'formatVersion', from: 2, to: 3, migrate: packChunkTable },
]

export type MigratedSaveSlotReading = SaveSlotReading & { migrations: readonly SaveMigration[] }

/** The chain, then the header check and restore of `readSaveSlot`, then the sections it restored. */
export function readMigratedSaveSlot(file: unknown): MigratedSaveSlotReading {
  const { migrated, migrations } = migrateSaveSlot(file)
  const reading = readSaveSlot(migrated)
  return { ...reading, migrations: [...migrations, ...sectionRestoresOf(file, reading)] }
}

/** Runs every step whose `from` the file is at, in chain order. */
export function migrateSaveSlot(file: unknown): {
  migrated: unknown
  migrations: HeaderVersionStep[]
} {
  let migrated = file
  const migrations: HeaderVersionStep[] = []
  for (const step of SAVE_MIGRATION_STEPS) {
    const next = isAtStepStart(migrated, step) ? step.migrate(migrated) : null
    if (next === null) continue
    migrated = next
    migrations.push({ version: step.version, from: step.from, to: step.to })
  }
  return { migrated, migrations }
}

/**
 * Read off the file as saved, since a step re-saves every section: a file that read back has the
 * shape of a save, whatever its header versions were.
 */
function sectionRestoresOf(file: unknown, reading: SaveSlotReading): SectionRestore[] {
  if (!('state' in reading)) return []
  const restored = sectionsRestoredBy(snapshotOfSaveSlot(file as SaveSections))
  return restored.length === 0
    ? []
    : [{ restoredSections: restored.map((section) => ({ section })) }]
}

function isAtStepStart(file: unknown, step: SaveMigrationStep): file is MigratingFile {
  return typeof file === 'object' && file !== null && Reflect.get(file, step.version) === step.from
}

function isPackedFile(file: MigratingFile): file is SaveSlotFile {
  return file.formatVersion >= FIRST_PACKED_FORMAT
}

/** The file's session snapshot, a packed table unpacked first; null when it does not unpack. */
function snapshotOfFile(file: MigratingFile): SessionSnapshot | null {
  if (!isPackedFile(file)) return snapshotOfSaveSlot(file)
  const unpacked = sectionsOfSaveSlot(file)
  return 'sections' in unpacked ? snapshotOfSaveSlot(unpacked.sections) : null
}

/** The file with its sections cut again from `snapshot`, packed as it was, every other header field kept. */
function withSectionsOf(file: MigratingFile, snapshot: SessionSnapshot): MigratingFile {
  const sections = saveSectionsOf(snapshot, file.saveEpoch)
  if (!isPackedFile(file)) return { ...file, ...sections }
  return { ...file, ...sections, world: packedWorldOf(sections.world) }
}

/** The file with its state reshaped into snapshot `toVersion`, or null when the old digest fails. */
function reshapedFile(
  file: MigratingFile,
  toVersion: number,
  reshape: (state: PortableState) => PortableState,
): MigratingFile | null {
  const snapshot = snapshotOfFile(file)
  const reshaped = snapshot === null ? null : reshapedSnapshot(snapshot, toVersion, reshape)
  return reshaped === null ? null : withSectionsOf(file, reshaped)
}

/** Snapshot 18 -> 19: the levels x10; the generator version is kept for its own step. */
function levelsToSteps(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 19, withLevelsAsSteps)
}

function withLevelsAsSteps(state: PortableState): PortableState {
  const players = Object.entries(state.players).map(([id, player]) => [id, playerWithSteps(player)])
  return { ...state, players: Object.fromEntries(players) }
}

function playerWithSteps(player: PortablePlayer): PortablePlayer {
  const { vehicle } = player
  const gun = { ...vehicle.gun, level: stepOfMajor(vehicle.gun.level) }
  return { ...player, vehicle: { ...vehicle, levels: stepsOfMajors(vehicle.levels), gun } }
}

/** Snapshot 19 -> 20: the racks by size; the generator version is kept for its own step. */
function sizeChargeRacks(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 20, withSizedChargeRacks)
}

/** Snapshot 20 -> 21: the cursors' carried work at 0; the generator version is kept. */
function carryOnCursors(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 21, withCarriedCursors)
}

/** Snapshot 21 -> 22: system 1 and empty tanks are the absent keys, so the state is kept. */
function placeInFirstSystem(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 22, (state) => state)
}

/** Snapshot 22 -> 23: the starting tank is the absent key, so the state is kept. */
function keepStartingTanks(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 23, (state) => state)
}

/** Snapshot 23 -> 24: no jump drive is the absent key, so the state is kept. */
function keepVehiclesWithoutDrive(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 24, (state) => state)
}

/** Snapshot 24 -> 25: the one bay is the saved planet's, no other is the absent key: kept. */
function keepBayOnSavedPlanet(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 25, (state) => state)
}

/** Snapshot 25 -> 26: every pose and cursor aims at its facing, the absent aim: kept. */
function keepFacingsAsAims(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 26, (state) => state)
}

/** Snapshot 26 -> 27: no premium ledger is the absent key, so the state is kept. */
function keepHoldsWithoutPremium(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 27, (state) => state)
}

/** Snapshot 27 -> 28: a safe-integer count is a count's spelling below 2^53, so the state is kept. */
function keepSafeHoldCounts(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 28, (state) => state)
}

/** Snapshot 28 -> 29: each live blast its level 0 and its number, the counter past them. */
function numberLiveBlasts(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 29, withNumberedBlasts)
}

/** Snapshot 29 -> 30: no left planet's stamp is the absent key, so the state is kept. */
function keepPlanetsWithoutStamps(file: MigratingFile): MigratingFile | null {
  return reshapedFile(file, 30, (state) => state)
}

/** Generator 5 -> 6: the state is read as saved (the digest must hold), then moved off the pad. */
function regeneratePadArea(file: MigratingFile): MigratingFile | null {
  const restored = restoreUnderThisGenerator(file)
  if (restored === null) return null
  const moved = placeVehiclesAtSellBay(withoutPadAreaChunks(restored))
  return { ...withSectionsOf(file, takeSnapshot(moved)), generatorVersion: 6 }
}

/** Generator 6 -> 7: the state is read as saved and written again under this generator. */
function keepEditsUnderOreLeads(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 7)
}

/** Generator 7 -> 8: as 6 -> 7, since the mix too moves only cells no one has dug. */
function keepEditsUnderOreMix(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 8)
}

/** Generator 8 -> 9: as 7 -> 8, the saved planet unstamped and so on the rows it was generated on. */
function keepLegacyOreRows(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 9)
}

/** Generator 9 -> 10: as 8 -> 9, the saved planet keeps its stamp and so draws no material kind. */
function keepCellsWithoutRoster(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 10)
}

function keepStepBandDensity(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 11)
}

function keepShippedSurface(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 12)
}

function keepLadderRadius(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 13)
}

function keepTwelveSpecies(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 14)
}

function keepRarePatches(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 15)
}

function keepBandTwoRares(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 16)
}

function keepPlanetOneWithoutGems(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 17)
}

/** Generator 17 -> 18: as 16 -> 17, the saved planet keeps its stamp and so the pool it drew. */
function keepPlanetsWithoutPools(file: MigratingFile): MigratingFile | null {
  return keptUnderGenerator(file, 18)
}

function keptUnderGenerator(file: MigratingFile, generatorVersion: number): MigratingFile | null {
  const restored = restoreUnderThisGenerator(file)
  if (restored === null) return null
  return { ...withSectionsOf(file, takeSnapshot(restored)), generatorVersion }
}

/**
 * Format 1 -> 2: the autosave's header around the sections as saved. The state must read whole
 * under this build (the digest holds), so the unlock ids are those of the state that loads.
 */
function addSlotHeader(file: MigratingFile): MigratingFile | null {
  const state = restoredStateOf(file, file.generatorVersion)
  if (state === null) return null
  return { ...file, formatVersion: 2, slot: UNTIMED_AUTOSAVE, unlocked: unlocksToSave(state) }
}

/**
 * Format 2 -> 3: the deltas packed, every other field as saved. A table that does not hold chunk
 * deltas would not pack, so the file is left at 2 and refused on its version.
 */
function packChunkTable(file: MigratingFile): SaveSlotFile | null {
  if (isPackedFile(file) || portableWorldProblems(file.world).length > 0) {
    return null
  }
  return { ...(file as SlottedFile), formatVersion: 3, world: packedWorldOf(file.world) }
}

/** A generator bump never changes the state's shape, so the old state restores as it is. */
function restoreUnderThisGenerator(file: MigratingFile): AuthorityState | null {
  return restoredStateOf(file, GENERATOR_VERSION)
}

/** The state the file holds, read as written under `generatorVersion`, or null if it is refused. */
function restoredStateOf(file: MigratingFile, generatorVersion: number): AuthorityState | null {
  const snapshot = snapshotOfFile(file)
  if (snapshot === null) return null
  const restored = readSnapshot({ ...snapshot, generatorVersion })
  return 'state' in restored ? restored.state : null
}

function withoutPadAreaChunks(state: AuthorityState): AuthorityState {
  const params = planetParamsFor(state.planet.seed, state.planet.index)
  const dropped = padAreaChunkKeys(generator5DockSiteOf(params), dockSiteOf(params))
  return { ...state, world: withoutChunks(state.world, dropped) }
}

function withoutChunks(world: WorldState, dropped: ReadonlySet<string>): WorldState {
  const kept = Object.entries(world.chunks).filter(([key]) => !dropped.has(key))
  return { chunks: Object.fromEntries(kept) }
}

/** Every chunk the union of both pads and their cleared air touches. */
function padAreaChunkKeys(before: DockSite, after: DockSite): Set<string> {
  const firstColumn = chunkOfTile(Math.min(before.firstColumn, after.firstColumn))
  const lastColumn = chunkOfTile(Math.max(before.lastColumn, after.lastColumn))
  const firstRow = chunkOfTile(Math.min(before.padRow, after.padRow))
  const lastRow = chunkOfTile(Math.max(before.clearanceTopRow, after.clearanceTopRow))
  const keys = new Set<string>()
  for (let cx = firstColumn; cx <= lastColumn; cx++) {
    for (let cy = firstRow; cy <= lastRow; cy++) keys.add(chunkKey(cx, cy))
  }
  return keys
}

/**
 * The pad generator 5 laid (`dockSite.ts` before #175): 12 tiles from -6, run on to column 13
 * under the old Refinery bay from its unlock planet, on the lowest surface row under it.
 */
function generator5DockSiteOf(params: PlanetParams): DockSite {
  const firstColumn = -6
  const lastColumn = params.planetIndex >= refineryUnlockPlanet() ? 13 : 5
  let padRow = params.radiusTiles
  for (let tx = firstColumn; tx <= lastColumn; tx++) {
    padRow = Math.min(padRow, surfaceRowOfColumn(tx, params.radiusTiles))
  }
  return {
    padRow,
    firstColumn,
    lastColumn,
    clearanceTopRow: padRow + params.dockClearanceTiles,
    dockPoint: { tx: 0, ty: padRow + 1 },
    bays: params.dockBays,
  }
}

/** The old bays moved, so every vehicle waits on the Sell bay, where the tow lands too. */
function placeVehiclesAtSellBay(state: AuthorityState): AuthorityState {
  const site = dockSiteOf(planetParamsFor(state.planet.seed, state.planet.index))
  const pose = dockedPoseAt(site)
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      { ...player, vehicle: { ...player.vehicle, pose } },
    ]),
  )
  return { ...state, players }
}
