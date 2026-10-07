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
 * The Horizontal Scaler's lock (#80); a refreshed schedule changes this pin on purpose. Recompute
 * it with `node docs/scaling/horizontal/source_hash.mjs` (#153).
 */
export const LOCKED_SCHEDULE_SOURCE_HASH =
  'sha256:a420cb57bdc831be41eea490fe199873b567388c7159510acac920acd2814c8f'

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

/**
 * The first schedule row id written as a word of `text`: a report row (#146, #223) or an item hook
 * id (ticket 323) naming one is refused, since unlocks are stats.json's and `feature_unlocked`'s.
 */
export function unlockIdNamedIn(schedule: UnlockSchedule, text: string): string | undefined {
  const unlockIds = new Set(schedule.rows.map((row) => row.id))
  return wordsOf(text).find((word) => unlockIds.has(word))
}

function wordsOf(text: string): string[] {
  return text.split(/[^A-Za-z0-9_]+/).filter((word) => word.length > 0)
}

function hasModule(row: UnlockRow): boolean {
  return row.status !== 'vision' && row.status !== 'cut'
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
