/**
 * Spec support for the bore's data row (ticket 661): runs `play` with `DRILL_BORE_ROWS` set to a
 * side clearance, put back after, as `cutCarryFixtures.ts` sets a dev flag. The rules read the row
 * at call time (`drillBore.ts`), so the stamp, its lift and the casing ring all follow it.
 */
import { DRILL_BORE_ROWS, type DrillBoreRows } from '../../constants/balance'

/** #36's 1.9 m bore: half the 0.9 m body plus this is the 950 mm stamp radius protocol 100 cut. */
export const WIDE_BORE_CLEARANCE_MM = 500

export function withDrillSideClearance<T>(clearanceMm: number, play: () => T): T {
  const rows = DRILL_BORE_ROWS as { -readonly [K in keyof DrillBoreRows]: DrillBoreRows[K] }
  const shipped = rows.sideClearanceMm
  rows.sideClearanceMm = clearanceMm
  try {
    return play()
  } finally {
    rows.sideClearanceMm = shipped
  }
}
