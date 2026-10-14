/**
 * Grounded bore lines (ticket 378, K-ground in the TD lock on #318; Content's earthing spike on
 * #310): a shot whose shape sets `groundTicks` grounds the cells its line opened, as the line ends,
 * until `untilTick` (the end tick plus `groundTicks`). The shock check (`electrifiedShock.ts`)
 * reads it: an electrified cell on a grounded line costs a drill neither its shock ticks nor its
 * hull, whoever drills it, so the line stays quiet if a collapse refills it. Grounding is never a
 * gate: it is read only by the shock check, so it makes no undiggable cell diggable.
 *
 * Plain JSON of safe integers, saved, restored and digested with the rest; a line leaves the
 * state on its `untilTick`, on the clock, and every line goes on a new planet. A session that
 * never grounded holds no `groundedLines` key, so its digests and saves are the ones it had before.
 */
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import type { PendingBore } from '../bore/boreState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export interface GroundedLine {
  /** The first tick the line is live again. */
  untilTick: number
  /** The cells the line opened, in walk order. */
  cells: readonly TilePoint[]
}

export const NO_GROUNDED_LINES: readonly GroundedLine[] = []

export function groundedLinesOf(state: AuthorityState): readonly GroundedLine[] {
  return state.groundedLines ?? NO_GROUNDED_LINES
}

/** The state with these grounded lines; with none, the `groundedLines` key is dropped. */
export function withGroundedLines(
  state: AuthorityState,
  lines: readonly GroundedLine[],
): AuthorityState {
  const { groundedLines: _dropped, ...rest } = state
  return lines.length === 0 ? rest : { ...rest, groundedLines: lines }
}

export function hasGroundedLines(state: AuthorityState): boolean {
  return groundedLinesOf(state).length > 0
}

/** Whether a grounded line holds `tile` now. */
export function isCellGrounded(state: AuthorityState, tile: TilePoint): boolean {
  return groundedLinesOf(state).some(
    (line) => line.untilTick > state.tick && line.cells.some((cell) => isSameTile(cell, tile)),
  )
}

/** The tick an ended line grounds its cells until; null when its shot grounds nothing or it opened none. */
export function groundedUntilOf(bore: PendingBore, tick: number): number | null {
  const groundTicks = bore.shot.groundTicks
  if (groundTicks === undefined || bore.bored.length === 0) return null
  return tick + groundTicks
}

/** The ended line's opened cells grounded when its shot grounds them; unchanged otherwise. */
export function groundEndedBore(
  state: AuthorityState,
  bore: PendingBore,
  tick: number,
): AuthorityState {
  const untilTick = groundedUntilOf(bore, tick)
  if (untilTick === null) return state
  const line: GroundedLine = { untilTick, cells: bore.bored }
  return withGroundedLines(state, [...groundedLinesOf(state), line])
}

/** The clock step: every line whose `untilTick` has come leaves the state. */
export function expireGroundedLines(state: AuthorityState, tick: number): TickOutcome {
  if (!hasGroundedLines(state)) return { state, events: [] }
  const live = groundedLinesOf(state).filter((line) => line.untilTick > tick)
  return { state: withGroundedLines(state, live), events: [] }
}

/** The next tick a grounded line expires; null with none. */
export function nextGroundedExpiryTick(state: AuthorityState): number | null {
  const ticks = groundedLinesOf(state).map((line) => Math.max(line.untilTick, state.tick + 1))
  return ticks.length === 0 ? null : Math.min(...ticks)
}

export function portableGroundedLinesOf(lines: readonly GroundedLine[]): GroundedLine[] {
  return lines.map((line) => ({ untilTick: line.untilTick, cells: line.cells.map(copyTile) }))
}

export function portableGroundedLinesProblems(lines: unknown, path: string): string[] {
  if (lines === undefined) return []
  if (!Array.isArray(lines) || lines.length === 0) return [`${path} must be a non-empty list`]
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !isGroundedLine(line))
    .map(({ index }) => `${path}[${index}] is malformed`)
}

function isGroundedLine(line: unknown): boolean {
  return (
    isJsonObject(line) &&
    isWholeNumber(line.untilTick) &&
    Array.isArray(line.cells) &&
    line.cells.length > 0 &&
    line.cells.every(isTile)
  )
}

function isTile(tile: unknown): boolean {
  return isJsonObject(tile) && Number.isSafeInteger(tile.tx) && Number.isSafeInteger(tile.ty)
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function copyTile(tile: TilePoint): TilePoint {
  return { tx: tile.tx, ty: tile.ty }
}
