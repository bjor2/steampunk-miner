/**
 * Where the hazard strip lies on screen (ticket 341; VS on #500): a track that starts
 * `STRIP_INNER_VMIN` hundredths of the short axis out from the middle and runs
 * `STRIP_LENGTH_VMIN`, from the screen alone, so no zoom, speed, depth or drill level moves or
 * sizes it. The vehicle's body, held at the middle, never reaches its inner end, at any zoom.
 *
 * On a phone (ticket 685, spec #678) the same track, laid along the drive at the same reach,
 * slides sideways out of the shaft to the screen's edge: the left edge lane for a drive up or
 * down (the right one holds the edge gauge), under the strip's top box for a drive across, so
 * nothing it draws sits over the shaft the drill cuts.
 */
import { STRIP_INNER_VMIN, STRIP_LENGTH_VMIN } from '../../constants/hazardStrip'
import { DESIGN_TOKENS, type DesignTokens } from './designSystem'
import type { ScreenSize } from './hudClearView'

const PERCENT = 100

export interface HazardStripReach {
  /** Pixels from the screen's middle to the strip's near end. */
  inner: number
  /** The strip's length in pixels. */
  length: number
}

export function hazardStripReachOf(screen: ScreenSize): HazardStripReach {
  return { inner: innerPxOf(screen), length: lengthPxOf(screen) }
}

/** The custom properties the strip's sheet lays it out by. */
export function hazardStripStyleOf(): Record<string, string> {
  return {
    '--strip-inner': `${STRIP_INNER_VMIN}vmin`,
    '--strip-length': `${STRIP_LENGTH_VMIN}vmin`,
  }
}

/** Screen pixels the strip's anchor moves from the middle, x right and y down. */
export interface HazardStripShift {
  x: number
  y: number
}

/**
 * The phone's shift for a drive `driveAngle` radians counter-clockwise from screen up, written
 * into `out` so the per-frame draw allocates nothing: across the drive as far as the whole track
 * still fits inside the edge box. The left or top side is tried first; the other side takes over
 * when the first cannot clear the shaft (a diagonal drive whose track would run off the screen).
 */
export function hazardStripEdgeShiftInto(
  out: HazardStripShift,
  screen: ScreenSize,
  driveAngle: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): HazardStripShift {
  const acrossX = Math.cos(driveAngle)
  const acrossY = -Math.sin(driveAngle)
  const first = isTowardTopLeft(acrossX, acrossY) ? 1 : -1
  const firstShift = trackShiftOf(screen, driveAngle, first, tokens)
  const isFirstClear = firstShift >= innerPxOf(screen)
  const side = isFirstClear ? first : -first
  const shift = isFirstClear ? firstShift : trackShiftOf(screen, driveAngle, side, tokens)
  out.x = side * acrossX * shift
  out.y = side * acrossY * shift
  return out
}

/**
 * Of the two ways across a drive, the one leaning toward the top-left corner; on a diagonal,
 * where both lean alike, the one leaning up, away from the thumb zone.
 */
function isTowardTopLeft(acrossX: number, acrossY: number): boolean {
  const leaning = acrossX + acrossY
  return Math.abs(leaning) < NO_SHARE ? acrossY < 0 : leaning < 0
}

/** How far the track may slide to `side` of the drive with both of its ends inside the edge box. */
function trackShiftOf(
  screen: ScreenSize,
  driveAngle: number,
  side: number,
  tokens: DesignTokens,
): number {
  const driveX = -Math.sin(driveAngle)
  const driveY = -Math.cos(driveAngle)
  const acrossX = side * Math.cos(driveAngle)
  const acrossY = -side * Math.sin(driveAngle)
  const near = innerPxOf(screen)
  const far = near + lengthPxOf(screen)
  const middleX = screen.width / 2
  const middleY = screen.height / 2
  return Math.min(
    roomFrom(screen, middleX + near * driveX, middleY + near * driveY, acrossX, acrossY, tokens),
    roomFrom(screen, middleX + far * driveX, middleY + far * driveY, acrossX, acrossY, tokens),
  )
}

/**
 * How far from (x, y) along (dx, dy) the edge box's border lies, 0 from outside it: the edge lane
 * plus a margin in from the sides and the foot, and under the strip's top box at the top.
 */
function roomFrom(
  screen: ScreenSize,
  x: number,
  y: number,
  dx: number,
  dy: number,
  tokens: DesignTokens,
): number {
  const { edgeLanePx, marginPx, strip } = tokens.layout
  const side = edgeLanePx + marginPx
  const top = strip.heightPx.phone + marginPx + side
  const roomX = dx < 0 ? x - side : screen.width - side - x
  const roomY = dy < 0 ? y - top : screen.height - side - y
  return Math.max(0, Math.min(reachAlong(dx, roomX), reachAlong(dy, roomY)))
}

/** A share this close to 0 is a cardinal drive's rounding, not a way across. */
const NO_SHARE = 1e-9

function reachAlong(share: number, room: number): number {
  if (room < 0) return 0
  return Math.abs(share) < NO_SHARE ? Infinity : room / Math.abs(share)
}

function innerPxOf(screen: ScreenSize): number {
  return (Math.min(screen.width, screen.height) * STRIP_INNER_VMIN) / PERCENT
}

function lengthPxOf(screen: ScreenSize): number {
  return (Math.min(screen.width, screen.height) * STRIP_LENGTH_VMIN) / PERCENT
}
