/**
 * The campaign unlock schedule at runtime (#87): the locked Schedule C rows (#80) and the gate
 * checks that say whether a row is unlocked. Flags only; a row's feature behaviour lives with its
 * own module.
 *
 * The file's `bind` is the #79 discriminant without its slot or facility id (no artefact or
 * facility ids exist for the campaign rows yet), so an artefact, facility or manual row is keyed
 * by its own row id until those ids are added to the schedule.
 */
import LOCKED_SCHEDULE_FILE from '../../../docs/scaling/horizontal/stats.json'
import {
  readUnlockSchedule,
  type UnlockBind,
  type UnlockRow,
  type UnlockSchedule,
} from './readUnlockSchedule'

/**
 * Vision rows whose module this build ships (#90 M tickets). The locked file's bytes are pinned and
 * marking a row's `status` is the Horizontal Scaler's refresh (#87), so a module built ahead of
 * that refresh is listed here and unlocks by its bind; every other vision row still shows nothing.
 * `auto_guns`: M2 #93 (spec #107), the hull turret bought at the Upgrade bay from planet 4.
 * `tunnel_wrecker`: M3 #94.
 */
export const BUILT_VISION_ROW_IDS: ReadonlySet<string> = new Set(['auto_guns', 'tunnel_wrecker'])

/** The Horizontal Scaler's lock (#80); a refreshed schedule changes this pin on purpose. */
export const LOCKED_SCHEDULE_SOURCE_HASH =
  'sha256:419ca56d8af626d1f0ff799075be9e72726381567c26168b7d0a6fbf8e1f3481'

export const LOCKED_SCHEDULE: UnlockSchedule = loadLockedSchedule(LOCKED_SCHEDULE_FILE)

/** What the run has done that a bind can answer to. */
export interface UnlockProgress {
  /** The furthest planet the run has arrived at (or bought travel to). */
  highestPlanetIndex: number
  collectedArtefactRowIds: ReadonlySet<string>
  builtFacilityRowIds: ReadonlySet<string>
  /** Rows a story beat or script has set (`manual` bind). */
  manualUnlockRowIds: ReadonlySet<string>
}

/** The rows whose earliest planet is exactly `planetIndex`. */
export function rowsAt(schedule: UnlockSchedule, planetIndex: number): UnlockRow[] {
  return schedule.rows.filter((row) => row.planetIndex === planetIndex)
}

/** Unlocks scheduled up to and including `planetIndex`, an artefact set counting each pick. */
export function unlockCountThrough(schedule: UnlockSchedule, planetIndex: number): number {
  return schedule.rows
    .filter((row) => row.planetIndex <= planetIndex)
    .reduce((total, row) => total + row.count, 0)
}

/** A cut row, or a vision row with no module built, unlocks nothing and shows nothing (#90). */
export function isUnlocked(row: UnlockRow, progress: UnlockProgress): boolean {
  return hasModule(row) && isBindMet[row.bind](row, progress)
}

function hasModule(row: UnlockRow): boolean {
  if (row.status === 'vision') return BUILT_VISION_ROW_IDS.has(row.id)
  return row.status !== 'cut'
}

const isBindMet: Record<UnlockBind, (row: UnlockRow, progress: UnlockProgress) => boolean> = {
  planet_gate: (row, progress) => progress.highestPlanetIndex >= row.planetIndex,
  artefact: (row, progress) => progress.collectedArtefactRowIds.has(row.id),
  facility: (row, progress) => progress.builtFacilityRowIds.has(row.id),
  manual: (row, progress) => progress.manualUnlockRowIds.has(row.id),
}

function loadLockedSchedule(raw: unknown): UnlockSchedule {
  const reading = readUnlockSchedule(raw, LOCKED_SCHEDULE_SOURCE_HASH)
  if (!('schedule' in reading)) {
    throw new Error(`stats.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.schedule
}
