/**
 * The save migration chain (Producer call and TD save chain on #170): a save from an older build
 * loads through an ordered list of steps, one per version bump, each moving one header version up
 * by one, before the header check. A file no step fits is left as it is, so `readSaveSlot` refuses
 * it with its version problems, as before. Each step that ran is reported, and the checkpoint logs
 * one `save_migrated {version, from, to}` line per step.
 *
 * Snapshot 18 -> 19 (#180 section 3, TD on the migration rows, #181): a track's level and the
 * guns' level become steps, `L -> 10L`, so prices and stats are the same at every major boundary.
 * The old state is read as saved first, so a corrupt file is still refused on its digest; the
 * charge rack (whole slots) and the casing grade (a gate) stay single-tier and are not touched.
 * Wallet, items, codex and everything else are kept, and the digest is taken again.
 *
 * Generator 5 -> 6 (#175): the pad grew to -8..+12 under the two shop buildings, so the chunk edits
 * of every chunk the old or new pad and its cleared air touch are dropped and regenerate under the
 * new stamp, every vehicle is put on the Sell bay's rest pose, and the params are recomputed from
 * seed and index. Wallet, levels, owned items and everything else in the state are kept.
 *
 * A save from before both reads at snapshot 18 and generator 5: the snapshot step runs first, as
 * the TD's save chain orders them, so the pad step restores the state with this build's reader.
 *
 * A registered slice section the save lacks is no step: `readSnapshot` restores it at its initial
 * value, and the reading reports it after the steps as one `save_migrated {restoredSections}` (#224).
 */
import type { AuthorityState, PlayerState } from '../authority/authorityState'
import {
  readSnapshot,
  sectionsRestoredBy,
  SNAPSHOT_VERSION,
  takeSnapshot,
} from '../authority/sessionSnapshot'
import { refineryUnlockPlanet } from '../economy/refineryEconomy'
import { stepsOfMajors, stepOfMajor } from '../economy/upgradeSteps'
import { GENERATOR_VERSION } from '../generatorVersion'
import { dockedPoseAt } from '../vehicle/vehiclePose'
import { dockSiteOf, type DockSite } from '../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { chunkKey, chunkOfTile, surfaceRowOfColumn } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import {
  readSaveSlot,
  saveSlotOf,
  snapshotOfSaveSlot,
  type SaveSlotFile,
  type SaveSlotReading,
} from './saveSlot'

/** The header version a step moves on. */
export type MigratedVersion = 'snapshotVersion' | 'generatorVersion'

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
  migrate(file: SaveSlotFile): SaveSlotFile | null
}

/** The chain in the order a save written before every bump needs them (see the module comment). */
const SAVE_MIGRATION_STEPS: readonly SaveMigrationStep[] = [
  { version: 'snapshotVersion', from: 18, to: 19, migrate: levelsToSteps },
  { version: 'generatorVersion', from: 5, to: 6, migrate: regeneratePadArea },
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
  const restored = sectionsRestoredBy(snapshotOfSaveSlot(file as SaveSlotFile))
  return restored.length === 0
    ? []
    : [{ restoredSections: restored.map((section) => ({ section })) }]
}

function isAtStepStart(file: unknown, step: SaveMigrationStep): file is SaveSlotFile {
  return typeof file === 'object' && file !== null && Reflect.get(file, step.version) === step.from
}

/** Snapshot 18 -> 19: the state is read as saved (the digest must hold), then its levels x10. */
function levelsToSteps(file: SaveSlotFile): SaveSlotFile | null {
  const restored = restoreUnderThisBuild(file)
  if (restored === null) return null
  const stepped = { ...restored, players: mapPlayers(restored, playerWithSteps) }
  const { generatorVersion } = file
  return {
    ...saveSlotOf(takeSnapshot(stepped), file.saveEpoch),
    generatorVersion,
    snapshotVersion: 19,
  }
}

/**
 * Snapshot 18 has the shape of 19, only the meaning of the levels moved, so the old state restores
 * under this build's versions; the generator is checked by its own step.
 */
function restoreUnderThisBuild(file: SaveSlotFile): AuthorityState | null {
  const restored = readSnapshot({
    ...snapshotOfSaveSlot(file),
    snapshotVersion: SNAPSHOT_VERSION,
    generatorVersion: GENERATOR_VERSION,
  })
  return 'state' in restored ? restored.state : null
}

function playerWithSteps(player: PlayerState): PlayerState {
  const { vehicle } = player
  const gun = { ...vehicle.gun, level: stepOfMajor(vehicle.gun.level) }
  return { ...player, vehicle: { ...vehicle, levels: stepsOfMajors(vehicle.levels), gun } }
}

function mapPlayers(
  state: AuthorityState,
  map: (player: PlayerState) => PlayerState,
): AuthorityState['players'] {
  return Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, map(player)]))
}

/** Generator 5 -> 6: the state is read as saved (the digest must hold), then moved off the pad. */
function regeneratePadArea(file: SaveSlotFile): SaveSlotFile | null {
  const restored = restoreUnderThisGenerator(file)
  if (restored === null) return null
  const moved = placeVehiclesAtSellBay(withoutPadAreaChunks(restored))
  return { ...saveSlotOf(takeSnapshot(moved), file.saveEpoch), generatorVersion: 6 }
}

/** A generator bump never changes the state's shape, so the old state restores as it is. */
function restoreUnderThisGenerator(file: SaveSlotFile): AuthorityState | null {
  const restored = readSnapshot({
    ...snapshotOfSaveSlot(file),
    generatorVersion: GENERATOR_VERSION,
  })
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
