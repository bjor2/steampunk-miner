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
  { version: 'generatorVersion', from: 5, to: 6, migrate: regeneratePadArea },
  { version: 'generatorVersion', from: 6, to: 7, migrate: keepEditsUnderOreLeads },
  { version: 'generatorVersion', from: 7, to: 8, migrate: keepEditsUnderOreMix },
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
