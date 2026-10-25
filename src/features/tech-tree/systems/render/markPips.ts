/**
 * The Mark plate past its milestones (ticket 884; GD lock of 25 Oct, Tech Tree & UI room, on
 * Progression's merged row): the milestone studs stay at Marks 3, 6 and 9, at most 2 pips between
 * them count the Marks since the last stud, and past Mark 9 the plate wears a finish band that
 * steps every 3 Marks (12, 15, 18, ...) with the pips restarting each band. So no item goes more
 * than 3 Marks without a visible step and two neighbouring Marks never look the same, at any Mark:
 * the band and the pips are computed from the Mark number, with no table to run out of.
 *
 * The band's finishes are the rig look's (#809 LK1, the recorded LK pattern the Horizontal and
 * Vertical Scalers ruled on), cycled once a band. Look-only: no stats id, price or save field.
 */
import { SHIPPED_RIG_LOOKS, type RigLookFinish } from '../../../rig-look'
import { MILESTONE_MARKS } from '../markMilestones'

/** The Marks between two steps of the plate: the milestone spacing, kept past the last one. */
export const MARK_STEP = 3

/** The last milestone Mark: the plate's rivets stop here and the finish bands start after it. */
export const LAST_MILESTONE_MARK = MILESTONE_MARKS[MILESTONE_MARKS.length - 1]

/**
 * The finishes a band wears, in band order: mid-tone metals, so the dark rivets and the gilt pips
 * and studs both read on each, and none the plate's own brass or the Mastered gilt rim.
 */
export const BAND_FINISH_IDS: readonly string[] = [
  'blued-steel',
  'aged-copper',
  'verdigris',
  'case-hardened',
  'rose-bronze',
]

/** How far past its milestones a Mark's plate has stepped. */
export interface MarkPipStep {
  /** 0 up to the first band at Mark 12, then one more every 3 Marks. */
  band: number
  /** The Marks since the plate last stepped (a stud or a band): 0 to 2. */
  pips: number
}

export function markPipStepOf(mark: number): MarkPipStep {
  return { band: bandOfMark(mark), pips: mark % MARK_STEP }
}

/** The finish band `band` wears; null for band 0, which keeps the plate's own brass. */
export function bandFinishOf(band: number): RigLookFinish | null {
  if (band === 0) return null
  const finishId = BAND_FINISH_IDS[(band - 1) % BAND_FINISH_IDS.length]
  return SHIPPED_RIG_LOOKS.finishes[finishId] ?? null
}

function bandOfMark(mark: number): number {
  return Math.max(0, Math.floor((mark - LAST_MILESTONE_MARK) / MARK_STEP))
}
