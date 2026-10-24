/**
 * Where a line's finish band draws on the rig (ticket 809): a plate in the band's finish, at the
 * line's own attach point, carrying its pips. Pips count decades of power, which runs to millions
 * at a million purchases and the rig body is about 1.2 m long, so they are drawn as rank marks,
 * not one mark a decade: the leading digit as that many marks on a 3 x 3 grid, and the marks'
 * shape for the digit's place (a square pip for ones, a bar for tens, a diamond for hundreds,
 * larger each lap of the three), so a reader sees magnitude at a glance and the marks never
 * fall as the count rises. The plate is moved inside the rig body's box, so no badge pushes the drawn
 * outline past the rig bounds (G&V on #647) and none touches the drill tip (#789). Pure: positions
 * in metres in the vehicle's frame, from the attach point and the body box the caller reads.
 */
import type { Pair } from '../../../../systems/art/partsSidecar'

/** The box the rig body's parts cover, metres from the body's origin. */
export interface BodyBox {
  left: number
  bottom: number
  right: number
  top: number
}

/** A rectangle by its centre, metres. */
export interface BadgeRect {
  x: number
  y: number
  width: number
  height: number
}

export type PipShape = 'square' | 'bar' | 'diamond'

/** One rank mark on a plate: its centre, its shape and its size, metres. */
export interface PipMark {
  x: number
  y: number
  shape: PipShape
  size: number
}

/** A line's badge: the plate in its finish and the marks on it. */
export interface RigLookBadge {
  /** The line: an upgrade track id, or `fuel_tank`. */
  line: string
  finishColour: string
  metalness: number
  roughness: number
  plate: BadgeRect
  marks: readonly PipMark[]
}

/** The leading digit of the pips and its place. */
export interface PipRanks {
  /** 0 for ones, 1 for tens, ...: the shape and size of every mark. */
  place: number
  /** The leading digit: how many marks, 0 to 9. */
  count: number
}

/** A plate for a 3 x 3 grid of marks: small beside a 1.2 m rig, marks a few pixels at 360 px. */
export const BADGE_PLATE: Readonly<{ width: number; height: number }> = { width: 0.2, height: 0.2 }
const GRID_SIDE = 3
const MARK_PITCH = 0.06
const MARK_SIZE = 0.036
/** The largest mark, so a bar or a diamond still fits its grid cell. */
const MARK_SIZE_MAX = 0.04
/** A bar is this many marks wide. */
const BAR_WIDTH = 1.4
/** Each mark's dark edge, as a share of the mark. */
export const MARK_EDGE_SCALE = 1.3
const SHAPES: readonly PipShape[] = ['square', 'bar', 'diamond']
/** Each lap of the three shapes draws the marks this much larger. */
const SIZE_PER_LAP = 0.1

/** The ranks `pips` show: its leading digit and that digit's place. */
export function pipRanksOf(pips: number): PipRanks {
  const digits = String(Math.max(0, Math.floor(pips)))
  return { place: digits.length - 1, count: Number(digits[0]) }
}

/** A line's badge at its attach point, moved inside the body's box. */
export function badgeAt(
  line: string,
  finish: { colour: string; metalness: number; roughness: number },
  pips: number,
  anchor: Pair,
  body: BodyBox,
): RigLookBadge {
  const plate = plateInside(anchor, body)
  return {
    line,
    finishColour: finish.colour,
    metalness: finish.metalness,
    roughness: finish.roughness,
    plate,
    marks: marksOn(plate, pipRanksOf(pips)),
  }
}

/** Whether `rect` lies wholly inside `box`: the feel guard every badge keeps. */
export function isInsideBox(rect: BadgeRect, box: BodyBox): boolean {
  const { left, right, bottom, top } = edgesOf(rect)
  return left >= box.left && right <= box.right && bottom >= box.bottom && top <= box.top
}

/** A mark's drawn quad before its turn: a bar is wider, a diamond a square turned 45 degrees. */
export interface PipMarkQuad {
  width: number
  height: number
  /** Radians about the mark's centre. */
  angle: number
}

/** The quad `mark` draws, its dark edge excluded. */
export function pipMarkQuadOf(mark: PipMark): PipMarkQuad {
  const width = mark.shape === 'bar' ? mark.size * BAR_WIDTH : mark.size
  return { width, height: mark.size, angle: mark.shape === 'diamond' ? Math.PI / 4 : 0 }
}

/** The box a mark covers with its dark edge, its turn's reach included. */
export function markRectOf(mark: PipMark): BadgeRect {
  const { width, height, angle } = pipMarkQuadOf(mark)
  const reach = angle === 0 ? 1 : Math.SQRT2
  return {
    x: mark.x,
    y: mark.y,
    width: width * MARK_EDGE_SCALE * reach,
    height: height * MARK_EDGE_SCALE * reach,
  }
}

function plateInside([x, y]: Pair, body: BodyBox): BadgeRect {
  const halfWidth = BADGE_PLATE.width / 2
  const halfHeight = BADGE_PLATE.height / 2
  return {
    x: clamp(x, body.left + halfWidth, body.right - halfWidth),
    y: clamp(y, body.bottom + halfHeight, body.top - halfHeight),
    width: BADGE_PLATE.width,
    height: BADGE_PLATE.height,
  }
}

function marksOn(plate: BadgeRect, ranks: PipRanks): PipMark[] {
  const shape = SHAPES[ranks.place % SHAPES.length]
  const size = MARK_SIZE * (1 + SIZE_PER_LAP * Math.floor(ranks.place / SHAPES.length))
  const shown = Math.min(size, MARK_SIZE_MAX)
  return gridOf(plate, ranks.count).map(([x, y]) => ({ x, y, shape, size: shown }))
}

/** `count` cell centres of the plate's 3 x 3 grid, bottom row first, left to right. */
function gridOf(plate: BadgeRect, count: number): Pair[] {
  const first = -MARK_PITCH * ((GRID_SIDE - 1) / 2)
  return Array.from({ length: count }, (_, at): Pair => [
    plate.x + first + (at % GRID_SIDE) * MARK_PITCH,
    plate.y + first + Math.floor(at / GRID_SIDE) * MARK_PITCH,
  ])
}

function edgesOf(rect: BadgeRect): BodyBox {
  return {
    left: rect.x - rect.width / 2,
    right: rect.x + rect.width / 2,
    bottom: rect.y - rect.height / 2,
    top: rect.y + rect.height / 2,
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}
