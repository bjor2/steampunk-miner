/**
 * The drill bore's sizes, all from one data row (GD lock on #661): the cut is the body's width plus
 * the side clearance on each side (`DRILL_BORE_ROWS`), so nothing else names a bore radius. Read
 * at call time, so a spec that sets the row (`withDrillSideClearance`) moves every rule at once.
 *
 * - The **stamp radius** is half the body plus the clearance: 0.6 m (a 1.2 m bore) at the GD's
 *   0.15 m, #36's 0.95 m at 0.5 m. The width level does not grow the disc; the side cutters cut
 *   their cells beside it (`drillGearCells.ts`).
 * - The **lift** raises a level cut's disc along `localUp` (`drillStamp.ts`) so it reaches one
 *   density sample below the wheels, as #36's 0.25 m lift did: the level floor is rounded down to
 *   whole samples, so a disc that reaches a sample past the wheels cuts it level in one stamp. A
 *   clearance of a sample or less leaves no room to lift, so the disc stays on the body's centre
 *   and the tunnel is as tight above the rig as beside it.
 * - The **ring lag** (#41, #56 Q2: `2 x stampR + 0.25 m`) is the stamp's radius plus the casing
 *   ring's outer radius: a ring is laid once the stamp's centre is that far past its axis point, so
 *   on a straight cut no later stamp reaches it.
 */
import { BODY_HALF_SIZE_MM, CASING_LINING_WIDTH_MM, DRILL_BORE_ROWS } from '../../constants/balance'
import { MM_PER_SAMPLE } from '../world/sampleGrid'

export function drillStampRadiusMm(): number {
  return BODY_HALF_SIZE_MM + DRILL_BORE_ROWS.sideClearanceMm
}

export function drillStampLiftMm(): number {
  return Math.max(0, DRILL_BORE_ROWS.sideClearanceMm - MM_PER_SAMPLE)
}

export function casingRingLagMm(): number {
  return drillStampRadiusMm() + drillStampRadiusMm() + CASING_LINING_WIDTH_MM
}
