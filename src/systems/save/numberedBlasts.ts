/**
 * Snapshot 28 -> 29 (D1 #860), a save migration step's reshape: a live blast becomes its disc
 * record. Each one saved mid-crater gains the level every planter then owned, 0, and its
 * `blastSeq` in the order it went live, oldest first, and the session's counter starts past them
 * (absent with none), so the blasts a reload finishes keep the numbers they would have had.
 *
 * The rack is kept as saved: the 12-row ladder keeps sizes 1 to 10 as they were (radius, slots,
 * fuse and price), so every owned and planted charge is the same row and nobody owns anything else.
 */
import type { PortableState } from '../authority/sessionSnapshot'
import { UNOWNED_RADIUS_LEVEL } from '../authority/charges/blastDisc'
import { blastSeqFieldOf } from '../authority/charges/blastSeq'
import type { LiveBlast } from '../authority/charges/liveBlast'

/** A live blast as snapshots 18 to 28 wrote it: its blast had no level and no number. */
type UnnumberedBlast = Omit<LiveBlast, 'blast'> & {
  blast: Omit<LiveBlast['blast'], 'radiusLevel' | 'blastSeq'>
}

export function withNumberedBlasts(state: PortableState): PortableState {
  const saved = state.liveBlasts as readonly UnnumberedBlast[]
  const liveBlasts = saved.map(numberedBlastOf)
  return { ...state, liveBlasts, ...blastSeqFieldOf({ blastSeq: liveBlasts.length }) }
}

function numberedBlastOf(live: UnnumberedBlast, blastSeq: number): LiveBlast {
  return { ...live, blast: { ...live.blast, radiusLevel: UNOWNED_RADIUS_LEVEL, blastSeq } }
}
