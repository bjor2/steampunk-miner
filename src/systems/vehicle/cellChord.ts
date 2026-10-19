/**
 * How far a cut's line runs through a cell (ticket 570): the drill law prices a cell as the
 * metre of ground its cut crosses (#7, `subStepsPerTile`), so a front walking a tilted line, which
 * enters more cells a metre than a column or a row does, pays each cell for the length of the
 * line inside it. A column or a row crosses every cell for exactly a metre, its price unchanged.
 *
 * The line is the sweep's path extended both ways; the cell is its closed square of 1000 mm.
 * IEEE division and square root are exact to the bit on every engine, and the length is rounded
 * to whole mm, so the authority and a predicting guest agree.
 */
import { MM_PER_METRE } from '../../constants/physics'
import type { StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'

/** A line's mm through a cell: 1000 for a column or a row, 1000 when the line has no direction. */
export function chordMmThroughCell(from: StampPoint, to: StampPoint, tile: TilePoint): number {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  if (dx === 0 && dy === 0) return MM_PER_METRE
  const across = spanOf(from.xMm, dx, tile.tx * MM_PER_METRE)
  const down = spanOf(from.yMm, dy, tile.ty * MM_PER_METRE)
  const enter = Math.max(across.enter, down.enter)
  const leave = Math.min(across.leave, down.leave)
  if (leave <= enter) return 0
  return Math.round((leave - enter) * Math.sqrt(dx * dx + dy * dy))
}

/** The stretch of the line's parameter inside one cell side's band, `[low, low + 1000]`. */
interface Span {
  enter: number
  leave: number
}

function spanOf(start: number, delta: number, low: number): Span {
  const high = low + MM_PER_METRE
  if (delta === 0) return isWithin(start, low, high) ? WHOLE_LINE : NO_SPAN
  const atLow = (low - start) / delta
  const atHigh = (high - start) / delta
  return { enter: Math.min(atLow, atHigh), leave: Math.max(atLow, atHigh) }
}

function isWithin(value: number, low: number, high: number): boolean {
  return value >= low && value <= high
}

const WHOLE_LINE: Span = { enter: Number.NEGATIVE_INFINITY, leave: Number.POSITIVE_INFINITY }
const NO_SPAN: Span = { enter: 0, leave: 0 }
