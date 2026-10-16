/**
 * The clean tap a compact HUD box or the hint chip takes (VS's gesture-priority rule on #500, the
 * GD's narrow amendment of #16): one pointer, pressed and released inside the same box, never
 * further than `CLEAN_TAP_SLOP_PX` from where it landed, and no second pointer meanwhile. Anything
 * else (a drag, a pinch, a press that slid off) is not a tap, so steering, zoom and drilling never
 * wait on the HUD. Pure: the box hands it the pointer's moments.
 */
import { CLEAN_TAP_SLOP_PX } from '../../constants/touch'

/** A press on the box, as long as it can still become a tap; null once it no longer can. */
export interface TapPress {
  pointerId: number
  x: number
  y: number
}

export interface TapPoint {
  pointerId: number
  x: number
  y: number
}

/** A pointer lands: the first starts a press, a second spoils the one in progress. */
export function pressOnLanding(
  current: TapPress | null,
  landing: TapPoint,
  isFirst: boolean,
): TapPress | null {
  return isFirst && current === null ? { ...landing } : null
}

/** A pointer moves: the press survives only while that pointer stays within the slop. */
export function pressAfterMove(current: TapPress | null, moved: TapPoint): TapPress | null {
  if (current === null || current.pointerId !== moved.pointerId) return current
  return isWithinSlop(current, moved) ? current : null
}

/** A pointer lifts: whether it ends a clean tap, released inside the box it pressed. */
export function isCleanTapAt(current: TapPress | null, lift: TapPoint, isInside: boolean): boolean {
  if (current === null || current.pointerId !== lift.pointerId) return false
  return isInside && isWithinSlop(current, lift)
}

function isWithinSlop(press: TapPress, point: TapPoint): boolean {
  return Math.hypot(point.x - press.x, point.y - press.y) <= CLEAN_TAP_SLOP_PX
}
