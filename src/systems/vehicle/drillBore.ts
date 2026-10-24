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
 * - Along an aim between the four facings (ticket 791) the body's square is wider across its path,
 *   its corners' reach (1.27 m at 45 degrees), so the stamp's radius there is half that width plus
 *   the clearance (`drillStampRadiusMmAlong`): the body and its clearance fit the cut at every aim,
 *   as the TD's ruling on #662 asks of every tick. Along a facing it is the radius above, which the
 *   lift, the casing ring and its lag read.
 * - The **ring lag** (#41, #56 Q2: `2 x stampR + 0.25 m`) is the stamp's radius plus the casing
 *   ring's outer radius: a ring is laid once the stamp's centre is that far past its axis point, so
 *   on a straight cut no later stamp reaches it.
 */
import { BODY_HALF_SIZE_MM, CASING_LINING_WIDTH_MM, DRILL_BORE_ROWS } from '../../constants/balance'
import { AIM_STEPS_PER_TURN, UP_VECTOR_SCALE } from '../../constants/physics'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { aimDirectionOf, type Aim } from './aim'

/** The stamp's radius along one of the four facings: half the body plus the clearance. */
export function drillStampRadiusMm(): number {
  return BODY_HALF_SIZE_MM + DRILL_BORE_ROWS.sideClearanceMm
}

/** The stamp's radius along `aim`: half the body's width across it plus the clearance. */
export function drillStampRadiusMmAlong(aim: Aim): number {
  return bodyReachMmAlong(aim) + DRILL_BORE_ROWS.sideClearanceMm
}

/**
 * How far the body's square reaches from its centre along an aim, whole mm rounded up: half its
 * side along one of the four facings, its corner's reach between them (ticket 791). A square's
 * half width across an aim is its reach along the aim a quarter turn on, the same number.
 */
export function bodyReachMmAlong(aim: Aim): number {
  const { along, up } = aimDirectionOf(aim)
  return Math.ceil((BODY_HALF_SIZE_MM * (Math.abs(along) + Math.abs(up))) / UP_VECTOR_SCALE)
}

/** The widest stamp's radius over every aim: the one a diagonal cut carves. */
export function widestStampRadiusMm(): number {
  const aims = Array.from({ length: AIM_STEPS_PER_TURN }, (_, aim) => aim)
  return Math.max(...aims.map(drillStampRadiusMmAlong))
}

export function drillStampLiftMm(): number {
  return Math.max(0, DRILL_BORE_ROWS.sideClearanceMm - MM_PER_SAMPLE)
}

export function casingRingLagMm(): number {
  return drillStampRadiusMm() + drillStampRadiusMm() + CASING_LINING_WIDTH_MM
}
