/**
 * The save migration chain (Producer call and TD save chain on #170): a save from an older build
 * loads through an ordered list of steps, one per version bump, each moving one header version up
 * by one, before the header check. A file no step fits is left as it is, so `readSaveSlot` refuses
 * it with its version problems, as before. Each step that ran is reported, and the checkpoint logs
 * one `save_migrated {version, from, to}` line per step.
 *
 * Generator 5 -> 6 (#175): the pad grew to -8..+12 under the two shop buildings, so the chunk edits
 * of every chunk the old or new pad and its cleared air touch are dropped and regenerate under the
 * new stamp, every vehicle is put on the Sell bay's rest pose, and the params are recomputed from
 * seed and index. Wallet, levels, owned items and everything else in the state are kept.
 */
import type { AuthorityState } from '../authority/authorityState'
import { readSnapshot, takeSnapshot } from '../authority/sessionSnapshot'
import { refineryUnlockPlanet } from '../economy/refineryEconomy'
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
export type MigratedVersion = 'generatorVersion'

/** One step that ran: `save_migrated {version, from, to}`. */
export interface SaveMigration {
  version: MigratedVersion
  from: number
  to: number
}

interface SaveMigrationStep extends SaveMigration {
  /** The migrated file, or null when the file cannot be read at `from` (then nothing more runs). */
  migrate(file: SaveSlotFile): SaveSlotFile | null
}

/** The chain in the order the bumps landed. */
const SAVE_MIGRATION_STEPS: readonly SaveMigrationStep[] = [
  { version: 'generatorVersion', from: 5, to: 6, migrate: regeneratePadArea },
]

export type MigratedSaveSlotReading = SaveSlotReading & { migrations: readonly SaveMigration[] }

/** The chain, then the header check and restore of `readSaveSlot`. */
export function readMigratedSaveSlot(file: unknown): MigratedSaveSlotReading {
  const { migrated, migrations } = migrateSaveSlot(file)
  return { ...readSaveSlot(migrated), migrations }
}

/** Runs every step whose `from` the file is at, in chain order. */
export function migrateSaveSlot(file: unknown): {
  migrated: unknown
  migrations: SaveMigration[]
} {
  let migrated = file
  const migrations: SaveMigration[] = []
  for (const step of SAVE_MIGRATION_STEPS) {
    const next = isAtStepStart(migrated, step) ? step.migrate(migrated) : null
    if (next === null) continue
    migrated = next
    migrations.push({ version: step.version, from: step.from, to: step.to })
  }
  return { migrated, migrations }
}

function isAtStepStart(file: unknown, step: SaveMigrationStep): file is SaveSlotFile {
  return typeof file === 'object' && file !== null && Reflect.get(file, step.version) === step.from
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
