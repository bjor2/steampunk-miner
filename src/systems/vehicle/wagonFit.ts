/**
 * The wagon fit check (GD lock on #662 Part B, ticket 750; the Horizontal Scaler's condition 2:
 * "wagons and the cargo chain read the same width value, and their fit check goes in B2"). No wagon
 * body exists yet: the coal tender hangs at the wagon hitch, `hull.hitch`, as art only (ticket 758).
 * This is the rule a wagon will be held to, so a wagon that reads another width, or a hitch that
 * leaves the bore, fails before it ships:
 *
 * - a wagon is the rig's own square at the rig's width level (`bodyWidthMmAt`, the one width
 *   source), trailing the rig down the bore it cut, along the aim;
 * - the hitch is the vehicle sidecar's point in the bare body's frame, kept on a grown body's back
 *   edge with the art's own few cm past it and at the same share of its height (mounts anchoring to
 *   the body's edge are B3, #666);
 * - it fits when, in a straight bore along the aim, the wagon's sides lie within the bore's radius
 *   less the side clearance of the bore's axis (the clearance the rig keeps, it keeps), and the
 *   hitch within the bore itself: the art's point overhangs the 0.9 m box by a few cm, into the
 *   clearance, never into the wall.
 *
 * A render-side rule with no authority state; metres from the sidecar, mm from the bore row.
 */
import { BODY_HALF_SIZE_MM, DRILL_BORE_ROWS } from '../../constants/balance'
import { AIM_STEPS_PER_TURN, UP_VECTOR_SCALE } from '../../constants/physics'
import { aimDirectionOf, type Aim } from './aim'
import { bodyHalfMmAt, bodyWidthMmAt, boreRadiusMmAlongAt, squareReachMmAlong } from './drillBore'

/** A quarter turn of aim steps: a square's width across an aim is its reach along this far on. */
const QUARTER_TURN = AIM_STEPS_PER_TURN / 4

/** The side of the wagon a rig of `widthLevel` hauls, mm: the rig's own, from the one width row. */
export function wagonSideMmAt(widthLevel: number): number {
  return bodyWidthMmAt(widthLevel)
}

/** Every aim the rig can cut along, a turn's worth. */
export function everyAim(): Aim[] {
  return Array.from({ length: AIM_STEPS_PER_TURN }, (_, aim) => aim)
}

/**
 * Whether the hitch at the sidecar's bare-frame `hitchAtM` and the wagon behind it fit the bore a
 * rig of `widthLevel` cuts along `aim`, its side clearance kept.
 */
export function isWagonInBore(
  hitchAtM: readonly [number, number],
  aim: Aim,
  widthLevel: number,
): boolean {
  const boreMm = boreRadiusMmAlongAt(aim, widthLevel)
  const roomMm = boreMm - DRILL_BORE_ROWS.sideClearanceMm
  return (
    hitchAcrossMmOf(hitchAtM, aim, widthLevel) <= boreMm &&
    wagonAcrossMmOf(aim, widthLevel) <= roomMm
  )
}

/** How far the hitch lies across the bore's axis through the rig's centre, mm. */
function hitchAcrossMmOf(hitchAtM: readonly [number, number], aim: Aim, widthLevel: number) {
  const { aheadMm, upMm } = hitchOnBodyOf(hitchAtM, widthLevel)
  const { along, up } = aimDirectionOf(aim)
  return Math.abs(upMm * along - aheadMm * up) / UP_VECTOR_SCALE
}

/**
 * The hitch on the rig of `widthLevel`, mm from its centre: on its back edge with the art's own
 * overhang past it (a few cm, fixed, as the clearance is), at the same share of its height.
 */
function hitchOnBodyOf(hitchAtM: readonly [number, number], widthLevel: number) {
  const halfMm = bodyHalfMmAt(widthLevel)
  const overhangMm = Math.abs(hitchAtM[0] * 1000) - BODY_HALF_SIZE_MM
  const aheadMm = Math.sign(hitchAtM[0]) * (halfMm + overhangMm)
  const upMm = (hitchAtM[1] * 1000 * halfMm) / BODY_HALF_SIZE_MM
  return { aheadMm, upMm }
}

/** Half the wagon's width across the bore's axis, mm: its square's reach a quarter turn on. */
function wagonAcrossMmOf(aim: Aim, widthLevel: number): number {
  const halfMm = Math.ceil(wagonSideMmAt(widthLevel) / 2)
  return squareReachMmAlong((aim + QUARTER_TURN) % AIM_STEPS_PER_TURN, halfMm)
}
