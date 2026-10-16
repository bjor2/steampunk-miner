/**
 * Time dilation made visible (TD on #470, point 5; VS ruling 2 there): a frame longer than
 * `MAX_STEPS_PER_FRAME` steps drops the rest (`stepsDroppedByCap`), so a device too slow for its
 * ticks plays in slow motion, never out of step. This watch counts the dropped ticks for the perf
 * log and says when the "slow device" chip shows. It only reads what the frames ran and dropped,
 * so the tick sequence and the digest are the same with it or without it.
 *
 * Seconds are whole seconds of running frames, each judged once its frames add up to one second.
 * A single long frame (a hitch, a tab coming back from the background) is one second, however
 * long, so it can never show the chip alone.
 */
import { SLOW_DEVICE_DROPPED_SHARE, SLOW_DEVICE_SECONDS } from '../constants/physics'

/** A mutable watch: it changes every frame and is read outside React. */
export interface TickDilationWatch {
  /** Every tick the cap dropped since the watch began. */
  ticksDroppedByCap: number
  /** The second being counted: its frames' seconds, the ticks they were due and dropped. */
  secondSeconds: number
  secondDueTicks: number
  secondDroppedTicks: number
  /** Judged seconds in a row over the share, and at or under it. */
  dilatedSecondsInRow: number
  steadySecondsInRow: number
  isSlowDevice: boolean
}

/** Frames of 1/60 s add up to a hair under one second in floating point. */
const SECOND_EPSILON = 1e-9

export function createTickDilationWatch(): TickDilationWatch {
  return {
    ticksDroppedByCap: 0,
    secondSeconds: 0,
    secondDueTicks: 0,
    secondDroppedTicks: 0,
    dilatedSecondsInRow: 0,
    steadySecondsInRow: 0,
    isSlowDevice: false,
  }
}

/** One running frame: `steps` ran, `dropped` were cut by the cap. */
export function watchFrameSteps(
  watch: TickDilationWatch,
  frameSeconds: number,
  steps: number,
  dropped: number,
): void {
  addFrameToSecond(watch, frameSeconds, steps, dropped)
  judgeFullSecond(watch)
}

function addFrameToSecond(
  watch: TickDilationWatch,
  frameSeconds: number,
  steps: number,
  dropped: number,
): void {
  watch.ticksDroppedByCap += dropped
  watch.secondSeconds += frameSeconds
  watch.secondDueTicks += steps + dropped
  watch.secondDroppedTicks += dropped
}

function judgeFullSecond(watch: TickDilationWatch): void {
  if (watch.secondSeconds < 1 - SECOND_EPSILON) return
  countSecondInRow(watch)
  settleSlowDevice(watch)
  startNextSecond(watch)
}

function countSecondInRow(watch: TickDilationWatch): void {
  const isDilated = isSecondDilated(watch)
  watch.dilatedSecondsInRow = isDilated ? watch.dilatedSecondsInRow + 1 : 0
  watch.steadySecondsInRow = isDilated ? 0 : watch.steadySecondsInRow + 1
}

function isSecondDilated(watch: TickDilationWatch): boolean {
  return watch.secondDroppedTicks > watch.secondDueTicks * SLOW_DEVICE_DROPPED_SHARE
}

function settleSlowDevice(watch: TickDilationWatch): void {
  if (watch.dilatedSecondsInRow >= SLOW_DEVICE_SECONDS) watch.isSlowDevice = true
  if (watch.steadySecondsInRow >= SLOW_DEVICE_SECONDS) watch.isSlowDevice = false
}

function startNextSecond(watch: TickDilationWatch): void {
  watch.secondSeconds = 0
  watch.secondDueTicks = 0
  watch.secondDroppedTicks = 0
}
