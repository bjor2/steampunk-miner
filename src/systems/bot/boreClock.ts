/**
 * The bot's bore on the scripted sub-step clock (ticket 559, #551 B2): a `drillTile` cuts its
 * window in sub-steps of the rig's drill quantum, so the bot waits a tile's real drill time, never
 * a whole tick rounded up. The part of the last tick a bore did not use is carried to the next bore
 * that starts at that tick, so a rig past 60 cells/s bores more than one cell a tick and one at
 * 1.4 ticks a cell averages 1.4, where the whole-tick clock charged 2.
 *
 * - A bore of `s` sub-steps with `c` carried waits `ceil((s - c) / Q)` ticks (none when the carry
 *   covers it) and carries the rest of its last tick. The wait is split in report-sized chunks.
 * - Each chunk's `drillTile` names the ticks it waited as its window; the first reaches one tick
 *   back when it spends a carry, so the windows always cover the tile's sub-steps. A window wider
 *   than the work costs nothing: the authority charges the law work removed (ticket 559).
 */
import { subStepsInQuantum } from '../vehicle/drillQuantum'

/** What a bore left of the tick it ended on, in sub-steps of its quantum. */
export interface BoreCarry {
  tick: number
  subSteps: number
  quantum: number
}

/** A tile's drill time on the scripted clock: sub-steps of the rig's quantum. */
export interface TileBore {
  subSteps: number
  quantum: number
}

/** One report's stretch of a bore: the ticks waited, then the `drillTile` window that names them. */
export interface BoreChunk {
  waitTicks: number
  windowTicks: number
}

export interface BorePlan {
  chunks: BoreChunk[]
  /** The sub-steps of the last tick the bore leaves for the next one. */
  leftSubSteps: number
}

/** The carry a bore starting at `tick` may spend: only one left at that very tick, in `quantum`. */
export function carriedSubStepsOf(
  carry: BoreCarry | undefined,
  tick: number,
  quantum: number,
): number {
  if (carry === undefined || carry.tick !== tick) return 0
  return subStepsInQuantum(carry.subSteps, carry.quantum, quantum)
}

/** The chunks of a bore of `bore` with `carried` sub-steps in hand, at most `maxChunkTicks` each. */
export function borePlanOf(bore: TileBore, carried: number, maxChunkTicks: number): BorePlan {
  const waitTicks = Math.max(0, Math.ceil((bore.subSteps - carried) / bore.quantum))
  const waits = splitTicks(waitTicks, maxChunkTicks)
  const reachBack = carried > 0 ? 1 : 0
  return {
    chunks: waits.map((wait, index) => ({
      waitTicks: wait,
      windowTicks: index === 0 ? wait + reachBack : wait,
    })),
    leftSubSteps: carried + waitTicks * bore.quantum - bore.subSteps,
  }
}

/** `ticks` in pieces of at most `most`; one empty piece for no ticks, so a bore still cuts. */
function splitTicks(ticks: number, most: number): number[] {
  if (ticks === 0) return [0]
  const whole = Math.floor(ticks / most)
  const rest = ticks % most
  return [...Array.from({ length: whole }, () => most), ...(rest > 0 ? [rest] : [])]
}
