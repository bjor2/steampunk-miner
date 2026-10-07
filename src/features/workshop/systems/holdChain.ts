/**
 * The hold-to-buy chain (#180 section 2; the faster curve is the GD's decision on #311, which
 * replaced G&V's first table): when the next step of a held chain fires, in 60 Hz ticks, and what
 * ends it.
 * Client-only feel: every step is still its own `buyUpgrade`, and the authority never sees the
 * curve, so retuning `holdCurve.json` never bumps the protocol or a golden.
 *
 * - The press buys one at once. Holding waits the wind-up, then climbs the gap rows one per step
 *   up to the last row, the cap. The wind-up is not a row and never replays.
 * - An ordinary major replaces the next gap with the pause, then the chain resumes
 *   `resumeRowsBack` rows below the row it is on, never below row 0.
 * - A milestone major ends the chain with its full moment; holding again starts a new chain.
 * - Release, focus leaving the plaque and a refused step end the chain after the step in flight.
 */
import type { RejectionReason } from '../../../systems/authority/domainEvent'
import HOLD_CURVE_FILE from '../holdCurve.json'

export interface HoldCurve {
  /** Ticks after the press before the second step: the "a click buys one" guard. */
  windUpTicks: number
  /** The gap rows, slowest first; the last row is the cap. */
  gapTicks: readonly number[]
  /** The breath an ordinary major takes in place of the next gap. */
  majorPauseTicks: number
  /** How many rows the chain steps back after an ordinary major. */
  resumeRowsBack: number
}

export const HOLD_CURVE: HoldCurve = HOLD_CURVE_FILE

/** What a step that landed was: a rivet pip, a big level-up, or a milestone big level-up. */
export type StepLanding = 'pip' | 'major' | 'milestone'

export type ChainEnd = 'release' | 'focus_left' | 'milestone' | 'refused'

export interface HoldChain {
  /** Steps landed so far, the press included. */
  steps: number
  /** The gap row the next ordinary step waits. */
  row: number
  /** The row the chain is on: the row of the gap before the next step, or the resume row. */
  onRow: number
  /** When the next step fires; null once the chain has ended. */
  nextStepTick: number | null
  end: ChainEnd | null
  /** The authority's reason when a refused step ended the chain. */
  refusal: RejectionReason | null
}

interface Climb {
  row: number
  onRow: number
  gapTicks: number
}

/** The press: the first step is due on the tick of the press. */
export function pressHoldChain(tick: number): HoldChain {
  return { steps: 0, row: 0, onRow: 0, nextStepTick: tick, end: null, refusal: null }
}

export function isStepDue(chain: HoldChain, tick: number): boolean {
  return chain.nextStepTick !== null && tick >= chain.nextStepTick
}

export function isChainLive(chain: HoldChain): boolean {
  return chain.end === null
}

/** A step the authority accepted landed at `tick`: schedule the next one, or end on a milestone. */
export function landStep(
  chain: HoldChain,
  tick: number,
  landing: StepLanding,
  curve: HoldCurve = HOLD_CURVE,
): HoldChain {
  if (!isChainLive(chain)) return chain
  if (landing === 'milestone') return { ...endedChain(chain, 'milestone'), steps: chain.steps + 1 }
  return scheduledAfter(chain, tick, nextClimbOf(chain, landing, curve))
}

/** The step was refused (money short, service reserve, track cap): the chain ends on its cue. */
export function refuseStep(chain: HoldChain, reason: RejectionReason): HoldChain {
  if (!isChainLive(chain)) return chain
  return { ...endedChain(chain, 'refused'), refusal: reason }
}

export function releaseHoldChain(chain: HoldChain): HoldChain {
  return isChainLive(chain) ? endedChain(chain, 'release') : chain
}

/** The pointer or finger left the plaque or part, or focus moved: a chain never changes track. */
export function leaveHoldFocus(chain: HoldChain): HoldChain {
  return isChainLive(chain) ? endedChain(chain, 'focus_left') : chain
}

/**
 * The tick of every step of a hold pressed at `pressTick` that is never released or refused,
 * one per landing; a milestone ends it, so nothing after one fires.
 */
export function holdStepTicks(
  landings: readonly StepLanding[],
  pressTick: number,
  curve: HoldCurve = HOLD_CURVE,
): number[] {
  const ticks: number[] = []
  let chain = pressHoldChain(pressTick)
  for (const landing of landings) {
    if (chain.nextStepTick === null) break
    ticks.push(chain.nextStepTick)
    chain = landStep(chain, chain.nextStepTick, landing, curve)
  }
  return ticks
}

function nextClimbOf(chain: HoldChain, landing: 'pip' | 'major', curve: HoldCurve): Climb {
  if (landing === 'major') return pausedClimb(chain, curve)
  if (chain.steps === 0) return { row: chain.row, onRow: chain.onRow, gapTicks: curve.windUpTicks }
  return climbedOneRow(chain, curve)
}

function pausedClimb(chain: HoldChain, curve: HoldCurve): Climb {
  const row = Math.max(chain.onRow - curve.resumeRowsBack, 0)
  return { row, onRow: row, gapTicks: curve.majorPauseTicks }
}

function climbedOneRow(chain: HoldChain, curve: HoldCurve): Climb {
  const capRow = curve.gapTicks.length - 1
  return {
    row: Math.min(chain.row + 1, capRow),
    onRow: chain.row,
    gapTicks: curve.gapTicks[chain.row],
  }
}

function scheduledAfter(chain: HoldChain, tick: number, climb: Climb): HoldChain {
  return {
    ...chain,
    steps: chain.steps + 1,
    row: climb.row,
    onRow: climb.onRow,
    nextStepTick: tick + climb.gapTicks,
  }
}

function endedChain(chain: HoldChain, end: ChainEnd): HoldChain {
  return { ...chain, nextStepTick: null, end }
}
