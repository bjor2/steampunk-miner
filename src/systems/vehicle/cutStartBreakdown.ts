/**
 * Where a cut's start from rest goes (ticket 433, measurement only, from the TD's shape on #430):
 * the ticks from the press of a drive into ground until the body follows the drill, split by what
 * holds it. Read off a rig's ticks in the live loop (`physics/cutStartLatency.lane.test.ts`).
 *
 * - **swivel**: the drill head turns to the new facing (`SWIVEL_TICKS`, #7) before the drill engages;
 * - **stale facing**: the drill is engaged but the cut gate stays shut. Until ticket 506 the
 *   authority read the facing of the last pose report here (reports went out every
 *   `POSE_REPORT_INTERVAL_TICKS`, #11 amendment, and every tick while the drill bites with the
 *   exact carry on since ticket 514); `drillStep` now carries the head's facing, so this reads 0 unless something else holds
 *   the gate;
 * - **first cell**: the gate is open and the drill pays the cell before the face, which opens only
 *   once its whole price is paid (#399's carry);
 * - **held**, then **second stall**: between the first and the second cell opening, the ticks the
 *   body holds `vCut` and the ticks it stands at the next uncut cell, which it meets early unless
 *   it rested with its face on a cell boundary.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'

/** One fixed tick of a cut started from rest, read after the tick. */
export interface CutStartTick {
  /** m/s along the facing over the tick. */
  speed: number
  /** The drill engaged this tick. */
  isDrilling: boolean
  /** The cut gate was open, so the drill set the speed (ticket 333). */
  isCutting: boolean
  /** The drill's speed the cut-follow read, in m/s; 0 with the gate shut. */
  cutSpeed: number
  /** A cell on the line ahead of the body's face opened (yielded) in the tick. */
  opensCell: boolean
}

/** A cut's start from rest, in fixed ticks from the press. */
export interface CutStartBreakdown {
  /** `vCut` as the gate opened, m/s. */
  cutSpeed: number
  /** One whole cell's drill time at that speed, in ticks (1 m at `vCut`). */
  cellTicks: number
  swivelTicks: number
  staleFacingTicks: number
  firstCellTicks: number
  /** The press to the tick the first cell opens. */
  firstCellOpenTick: number
  /** Null when no second cell opens in the ticks read. */
  heldTicks: number | null
  secondStallTicks: number
  /** Ticks the body stood with the drill engaged and pushing: stale facing, both stalls. */
  standingTicks: number
}

/** Within this share of `vCut`, the body holds the drill's speed (#430's 5% line). */
const HELD_SHARE = 1 / 20
/** Below this share of `vCut`, the body stands (the TD's `S` ticks). */
const STANDING_SHARE = 0.1

/** The start's breakdown, or null when the ticks never open a cell. */
export function breakDownCutStart(ticks: readonly CutStartTick[]): CutStartBreakdown | null {
  const engaged = ticks.findIndex((tick) => tick.isDrilling)
  const opened = ticks.findIndex((tick) => tick.isCutting)
  const firstOpen = indexOfOpening(ticks, Math.max(0, opened))
  if (engaged < 0 || opened < 0 || firstOpen < 0) return null
  const cutSpeed = ticks[opened].cutSpeed
  const between = ticksToSecondOpening(ticks, firstOpen)
  const secondStallTicks = countStanding(between, cutSpeed)
  return {
    cutSpeed,
    cellTicks: TICKS_PER_SECOND / cutSpeed,
    swivelTicks: engaged,
    staleFacingTicks: opened - engaged,
    firstCellTicks: firstOpen - opened,
    firstCellOpenTick: firstOpen,
    heldTicks: between === null ? null : countHeld(between, cutSpeed),
    secondStallTicks,
    standingTicks: opened - engaged + (firstOpen - opened) + secondStallTicks,
  }
}

/** The first tick from `from` on that opens a cell, or -1. */
function indexOfOpening(ticks: readonly CutStartTick[], from: number): number {
  const at = ticks.slice(from).findIndex((tick) => tick.opensCell)
  return at < 0 ? -1 : from + at
}

/** The ticks after the first cell opens, up to and with the next one opening; null with none. */
function ticksToSecondOpening(
  ticks: readonly CutStartTick[],
  firstOpen: number,
): readonly CutStartTick[] | null {
  const secondOpen = indexOfOpening(ticks, firstOpen + 1)
  return secondOpen < 0 ? null : ticks.slice(firstOpen + 1, secondOpen + 1)
}

function countHeld(ticks: readonly CutStartTick[], cutSpeed: number): number {
  return ticks.filter(({ speed }) => Math.abs(speed - cutSpeed) <= cutSpeed * HELD_SHARE).length
}

function countStanding(ticks: readonly CutStartTick[] | null, cutSpeed: number): number {
  return ticks === null ? 0 : ticks.filter(({ speed }) => speed < cutSpeed * STANDING_SHARE).length
}
