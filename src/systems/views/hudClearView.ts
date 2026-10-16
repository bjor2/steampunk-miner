/**
 * How much of the play view the compact HUD leaves clear (#500, GD rulings 2 and 3; TD shape 2):
 * the union of the boxes that draw over it (every `data-hud` box and every visible touch button),
 * clipped to the screen, as a share of the screen. A pixel under two boxes counts once. The
 * transparent stick zone draws nothing and is never a box here. Also where the vehicle can be on
 * screen while the camera leans ahead (#316's law), the rect no box may cover. Pure geometry in
 * CSS pixels: the spec and the hint queue hand it measured rects.
 */
import { BODY_HALF_SIZE_MM } from '../../constants/balance'
import { SPEED_FRAMING, VIEW_SHORT_AXIS_MIN_M } from '../../constants/scene'
import {
  CLEAR_VIEW_FLOOR_LANDSCAPE_PERCENT,
  CLEAR_VIEW_FLOOR_PORTRAIT_PERCENT,
} from '../../constants/screen'
import type { StageOrientation } from './screenLayout'

/** An axis-aligned box on screen, CSS px from the top left, as `getBoundingClientRect` reads. */
export interface ScreenBox {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ScreenSize {
  width: number
  height: number
}

const PERCENT = 100
const MM_PER_METRE = 1000

/** The share of the screen no box covers, 0 to 1. */
export function clearShareOf(boxes: readonly ScreenBox[], screen: ScreenSize): number {
  return 1 - coveredAreaOf(boxes, screen) / (screen.width * screen.height)
}

/** The area of the boxes' union inside the screen: each pixel once, however many boxes hold it. */
export function coveredAreaOf(boxes: readonly ScreenBox[], screen: ScreenSize): number {
  const clipped = boxes.map((box) => clipToScreen(box, screen)).filter(hasArea)
  const edges = [...new Set(clipped.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b)
  let area = 0
  for (let index = 1; index < edges.length; index++) {
    const [left, right] = [edges[index - 1], edges[index]]
    area += (right - left) * coveredHeightOf(clipped, left, right)
  }
  return area
}

/** 70% held upright, 65% sideways (GD ruling 2 on #500). */
export function clearViewFloorOf(orientation: StageOrientation): number {
  const percent =
    orientation === 'portrait'
      ? CLEAR_VIEW_FLOOR_PORTRAIT_PERCENT
      : CLEAR_VIEW_FLOOR_LANDSCAPE_PERCENT
  return percent / PERCENT
}

/** Whether the hint chip may show: with its box added the view still keeps its floor. */
export function isHintRoomFor(
  boxes: readonly ScreenBox[],
  hintBox: ScreenBox,
  screen: ScreenSize,
  floorShare: number,
): boolean {
  return clearShareOf([...boxes, hintBox], screen) >= floorShare
}

/**
 * Where the vehicle's body can be on screen: the camera holds it at the middle and leans ahead
 * by at most `leadMaxShare` of the half height down the screen and of the half short axis across
 * it (ticket 484: the zoom spans the height, the lean is laid in the camera's frame), and the body
 * reaches its half size further, drawn at the closest zoom. A square on a landscape screen, taller
 * than wide on a portrait one, so a lean either way stays inside it.
 */
export function vehicleKeepClearOf(screen: ScreenSize): ScreenBox {
  const shortAxis = Math.min(screen.width, screen.height)
  const pixelsPerMetre = screen.height / VIEW_SHORT_AXIS_MIN_M
  const bodyHalf = (BODY_HALF_SIZE_MM / MM_PER_METRE) * pixelsPerMetre
  const reachAcross = (SPEED_FRAMING.leadMaxShare * shortAxis) / 2 + bodyHalf
  const reachUp = (SPEED_FRAMING.leadMaxShare * screen.height) / 2 + bodyHalf
  const [middleX, middleY] = [screen.width / 2, screen.height / 2]
  return {
    left: middleX - reachAcross,
    top: middleY - reachUp,
    right: middleX + reachAcross,
    bottom: middleY + reachUp,
  }
}

/** Where the camera shows the vehicle: canvas size, scale, and its offset from the look point. */
export interface VehicleOnScreen {
  width: number
  height: number
  pixelsPerMetre: number
  /** World metres from the point the camera looks at to the vehicle. */
  fromCentre: { x: number; y: number }
  /** The camera's roll, counter-clockwise. */
  turnRadians: number
}

/** The vehicle body's box on screen: its world offset turned by the camera's roll, y down. */
export function vehicleScreenBoxOf(view: VehicleOnScreen): ScreenBox {
  const { fromCentre, turnRadians, pixelsPerMetre } = view
  const [cos, sin] = [Math.cos(turnRadians), Math.sin(turnRadians)]
  const across = fromCentre.x * cos + fromCentre.y * sin
  const up = -fromCentre.x * sin + fromCentre.y * cos
  const middleX = view.width / 2 + across * pixelsPerMetre
  const middleY = view.height / 2 - up * pixelsPerMetre
  const half = (BODY_HALF_SIZE_MM / MM_PER_METRE) * pixelsPerMetre
  return {
    left: middleX - half,
    top: middleY - half,
    right: middleX + half,
    bottom: middleY + half,
  }
}

/** Two boxes share area; touching edges do not (`slack` shaves each side for sub-pixel layout). */
export function doBoxesOverlap(a: ScreenBox, b: ScreenBox, slack = 0): boolean {
  return (
    a.left + slack < b.right &&
    b.left + slack < a.right &&
    a.top + slack < b.bottom &&
    b.top + slack < a.bottom
  )
}

function clipToScreen(box: ScreenBox, screen: ScreenSize): ScreenBox {
  return {
    left: Math.max(0, box.left),
    top: Math.max(0, box.top),
    right: Math.min(screen.width, box.right),
    bottom: Math.min(screen.height, box.bottom),
  }
}

function hasArea(box: ScreenBox): boolean {
  return box.right > box.left && box.bottom > box.top
}

/** How much of the column between `left` and `right` the boxes cover, overlaps merged. */
function coveredHeightOf(boxes: readonly ScreenBox[], left: number, right: number): number {
  const spans = boxes
    .filter((box) => box.left <= left && box.right >= right)
    .map((box) => [box.top, box.bottom] as const)
    .sort((a, b) => a[0] - b[0])
  let height = 0
  let reached = -Infinity
  for (const [top, bottom] of spans) {
    height += Math.max(0, bottom - Math.max(top, reached))
    reached = Math.max(reached, bottom)
  }
  return height
}
