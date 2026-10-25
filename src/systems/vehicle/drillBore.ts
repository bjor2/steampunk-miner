/**
 * The drill bore's sizes, all from one data row (GD lock on #661): the cut is the body's width plus
 * the side clearance on each side (`DRILL_BORE_ROWS`), so nothing else names a bore radius. Read
 * at call time, so a spec that sets the row (`withDrillSideClearance`) moves every rule at once.
 *
 * - The **stamp radius** is half the body plus the clearance: 0.6 m (a 1.2 m bore) at the GD's
 *   0.15 m, #36's 0.95 m at 0.5 m.
 * - The **width level** grows the body (GD lock on #662 Part B, ticket 749): a square of 0.9 m and
 *   `bodyWidthPerLevelMm` more a level, with no cap, and the stamp at the same clearance round it
 *   (`boreRadiusMmAt`). The host derives the level every tick from what the player owns
 *   (`registries/boreWidth.ts`); level 0, the bare body, is every rule's bore below. The row reads
 *   no economy number, so a paceScale change never moves a width.
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
import { AIM_STEPS_PER_TURN, MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { aimDirectionOf, type Aim } from './aim'

/** The bare body's width level: no width Mark owned. */
export const BARE_WIDTH_LEVEL = 0

/** The body's side at `widthLevel`: 0.9 m and `bodyWidthPerLevelMm` more a level, uncapped. */
export function bodyWidthMmAt(widthLevel: number): number {
  return 2 * BODY_HALF_SIZE_MM + widthLevel * DRILL_BORE_ROWS.bodyWidthPerLevelMm
}

/** Half the body's side at `widthLevel`, whole mm rounded up, so the stamp never cuts inside it. */
export function bodyHalfMmAt(widthLevel: number): number {
  return Math.ceil(bodyWidthMmAt(widthLevel) / 2)
}

/** The stamp's radius along a facing at `widthLevel`: half the body plus the clearance. */
export function boreRadiusMmAt(widthLevel: number): number {
  return bodyHalfMmAt(widthLevel) + DRILL_BORE_ROWS.sideClearanceMm
}

/** The bore's width along a facing at `widthLevel`: the body and its clearance either side. */
export function boreWidthMmAt(widthLevel: number): number {
  return 2 * boreRadiusMmAt(widthLevel)
}

/** The stamp's radius along `aim` at `widthLevel`: half the body across it plus the clearance. */
export function boreRadiusMmAlongAt(aim: Aim, widthLevel: number): number {
  return squareReachMmAlong(aim, bodyHalfMmAt(widthLevel)) + DRILL_BORE_ROWS.sideClearanceMm
}

/**
 * The cells a metre of straight bore opens at `widthLevel`: the whole metres its width spans, as
 * #316's width bench counts them (2 for the bare 1.2 m bore, one more a level).
 */
export function boreCellsPerMetreAt(widthLevel: number): number {
  return Math.ceil(boreWidthMmAt(widthLevel) / MM_PER_METRE)
}

/** The stamp's radius along one of the four facings: half the body plus the clearance. */
export function drillStampRadiusMm(): number {
  return boreRadiusMmAt(BARE_WIDTH_LEVEL)
}

/** The stamp's radius along `aim`: half the body's width across it plus the clearance. */
export function drillStampRadiusMmAlong(aim: Aim): number {
  return boreRadiusMmAlongAt(aim, BARE_WIDTH_LEVEL)
}

/**
 * How far the body's square reaches from its centre along an aim, whole mm rounded up: half its
 * side along one of the four facings, its corner's reach between them (ticket 791). A square's
 * half width across an aim is its reach along the aim a quarter turn on, the same number.
 */
export function bodyReachMmAlong(aim: Aim): number {
  return squareReachMmAlong(aim, BODY_HALF_SIZE_MM)
}

/** How far a square of half side `halfMm` reaches from its centre along `aim`, rounded up. */
function squareReachMmAlong(aim: Aim, halfMm: number): number {
  const { along, up } = aimDirectionOf(aim)
  return Math.ceil((halfMm * (Math.abs(along) + Math.abs(up))) / UP_VECTOR_SCALE)
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
  return casingRingLagMmAt(BARE_WIDTH_LEVEL)
}

/** The ring lag round the bore of `widthLevel`: its radius plus the casing ring's outer radius. */
export function casingRingLagMmAt(widthLevel: number): number {
  return boreRadiusMmAt(widthLevel) + boreRadiusMmAt(widthLevel) + CASING_LINING_WIDTH_MM
}
