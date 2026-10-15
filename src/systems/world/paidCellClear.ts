/**
 * The cells a swept tick's carry paid for, cleared in full (ticket 399, the TD ruling on #399 Q1):
 * a paid cell never stays standing, whatever its drill time against the tick. Its 16 samples are
 * lowered to nothing in the same edit as the stamp, ahead of it and in walk order, so the cells
 * the cut crosses yield in the order it crosses them; lining in them is cleared with them (#41).
 * The dock pad and lava never carve, as everywhere.
 */
import type { StampWalk } from './groundEdit'
import {
  clearCasingSample,
  densityOf,
  editSample,
  isCarvable,
  type EditSession,
} from './groundEditSession'
import { cellSamplesOf } from './stampShape'
import type { TilePoint } from './tileGrid'

/** `walk` after the paid cells are cleared; the tick counts as used when either removed anything. */
export function clearingPaidCellsFirst(paid: readonly TilePoint[], walk: StampWalk): StampWalk {
  return (session, disc, window, drillTicksOf) => {
    const cleared = clearCellsInFull(session, paid) ? window.ticks : 0
    return Math.max(cleared, walk(session, disc, window, drillTicksOf))
  }
}

/** Whether clearing the cells removed anything. */
function clearCellsInFull(session: EditSession, tiles: readonly TilePoint[]): boolean {
  let isAnyRemoved = false
  for (const sample of tiles.flatMap(cellSamplesOf)) {
    if (!isCarvable(session, sample) || densityOf(session, sample) === 0) continue
    editSample(session, sample, () => 0)
    clearCasingSample(session, sample)
    isAnyRemoved = true
  }
  return isAnyRemoved
}
