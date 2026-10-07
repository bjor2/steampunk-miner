/**
 * The marked cells a client keeps from its pings (the TD lock on #203 Q1): each ping's cells are
 * kept until its reveal runs out, or until the dock for a flare's map. The marks never pass the
 * cap: a ping past it keeps its cells nearest its centre, a fresh mark replaces an older one on the
 * same tile, and older marks give way soonest-to-expire first, a flare's map last.
 */
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { EchoMark } from './echoPing'

export interface RevealMark extends EchoMark {
  bornTick: number
  /** The first tick it is gone on; null for a flare's map, kept until the dock. */
  untilTick: number | null
}

export interface RevealPing {
  centre: TilePoint
  marks: readonly EchoMark[]
  bornTick: number
  untilTick: number | null
}

/** The marks after `ping`, never more than `cap`. */
export function marksAfterPing(
  marks: readonly RevealMark[],
  ping: RevealPing,
  cap: number,
): RevealMark[] {
  const fresh = freshMarksOf(ping, cap)
  const others = marksOffTilesOf(marks, fresh)
  return [...longestLivedOf(others, cap - fresh.length), ...fresh]
}

/** The marks still shown on `tick`. */
export function marksShownAt(marks: readonly RevealMark[], tick: number): RevealMark[] {
  return marks.filter((mark) => mark.untilTick === null || mark.untilTick > tick)
}

/** The marks a dock keeps: every flare's map is for one trip (#162 Sensing row). */
export function marksAfterDock(marks: readonly RevealMark[]): RevealMark[] {
  return marks.filter((mark) => mark.untilTick !== null)
}

/** The ping's cells nearest its centre first, row order breaking ties, up to `cap`. */
function freshMarksOf(ping: RevealPing, cap: number): RevealMark[] {
  return [...ping.marks]
    .sort((a, b) => distanceSqOf(a.tile, ping.centre) - distanceSqOf(b.tile, ping.centre))
    .slice(0, cap)
    .map((mark) => ({ ...mark, bornTick: ping.bornTick, untilTick: ping.untilTick }))
}

function marksOffTilesOf(marks: readonly RevealMark[], fresh: readonly RevealMark[]): RevealMark[] {
  const taken = new Set(fresh.map((mark) => tileKeyOf(mark.tile)))
  return marks.filter((mark) => !taken.has(tileKeyOf(mark.tile)))
}

/** The `room` marks that would last longest, in the order they were kept. */
function longestLivedOf(marks: readonly RevealMark[], room: number): RevealMark[] {
  if (marks.length <= room) return [...marks]
  const leaving = new Set([...marks].sort(compareSoonestGone).slice(0, marks.length - room))
  return marks.filter((mark) => !leaving.has(mark))
}

function compareSoonestGone(a: RevealMark, b: RevealMark): number {
  return untilOf(a) - untilOf(b) || a.bornTick - b.bornTick
}

/** A flare's map outlasts every timed mark. */
function untilOf(mark: RevealMark): number {
  return mark.untilTick ?? Number.MAX_SAFE_INTEGER
}

function distanceSqOf(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return dx * dx + dy * dy
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
