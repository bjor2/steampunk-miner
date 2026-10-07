/**
 * The debug API's time calls on the live game (#11 section 5, ticket 301): `pause()` holds the
 * fixed step until `resume()`, and `step(ticks)` runs that many fixed steps of the running world
 * now, physics and all, where `fastForward` advances the authority headlessly. Each answers where
 * the authority stands. A scenario or a restore waiting for play is started by `step` and
 * `resume` as by `fastForward`; a `pause()` is ended only by `resume()`.
 */
import { liveWorldProblems, stepLiveWorld } from '../physics/liveFixedStep'
import { takeSessionSnapshot, useGameStore } from '../store/gameStore'
import type { DebugResult } from './debugScreens'

/** Where the authority stands after a time or snapshot command. */
export interface SessionPoint {
  tick: number
  digest: string
}

/** One minute of play at most per call, so a slip of the keyboard cannot stall the page. */
const MAX_STEP_TICKS = 3600

export function pauseLiveGame(): DebugResult<SessionPoint> {
  useGameStore.getState().pauseLiveStep()
  return { ok: true, ...sessionPoint() }
}

export function resumeLiveGame(): DebugResult<SessionPoint> {
  useGameStore.getState().resumeLiveStep()
  return { ok: true, ...sessionPoint() }
}

export function stepLiveGame(ticks: number): DebugResult<SessionPoint> {
  const problems = [...stepTicksProblems(ticks), ...liveWorldProblems()]
  if (problems.length > 0) return { ok: false, problems }
  useGameStore.getState().prepareDebugSteps(ticks)
  stepLiveWorld(ticks)
  return { ok: true, ...sessionPoint() }
}

export function sessionPoint(): SessionPoint {
  const { tick, digest } = takeSessionSnapshot()
  return { tick, digest }
}

function stepTicksProblems(ticks: unknown): string[] {
  const isInRange =
    Number.isSafeInteger(ticks) && (ticks as number) >= 1 && (ticks as number) <= MAX_STEP_TICKS
  if (isInRange) return []
  return [`ticks must be a whole number from 1 to ${MAX_STEP_TICKS}, got ${JSON.stringify(ticks)}`]
}
