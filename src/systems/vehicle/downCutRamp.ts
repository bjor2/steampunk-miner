/**
 * The gravity ramp on a cut down's front (Bjor's ruling on #724): the body gains speed down no
 * faster than `a = max(g(r), 0.1 g_surface)` (`radialGravity.ts`, `vehicleMotion.ts`). It moved at
 * the velocity its last report gave, so on the `n`-th tick after that report it moves at most
 * `v + a dt n` a tick, and the swept cut's front steps no further than that, in whole mm rounded
 * up, so the front never lags the body it cuts for. Its top step stays the drill law's; a cut
 * sideways or up never ramps. A diagonal cut with a downward share (ticket 791) ramps along its
 * aim at the same `a`, the body's gain along the aim, as the motion rule holds it.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { Aim } from './aim'
import { isGravityRampedAim } from './cutAxisCaps'

/** What the ramp reads: the last report's speed along the aim, the ticks since, local gravity. */
export interface RampFromReport {
  reportedMmPerSecond: number
  ticksSinceReport: number
  /** m/s². */
  acceleration: number
}

/** The front's step along `aim`: on a cut down, `stepMm` held to the ramp; else as it is. */
export function rampedFrontStepMmOf(aim: Aim, stepMm: number, ramp: RampFromReport): number {
  if (!isGravityRampedAim(aim)) return stepMm
  return Math.min(stepMm, rampAllowedStepMmOf(ramp))
}

/**
 * Whole mm the body can move in this tick: the reported speed plus `a dt` for this tick and each
 * since the report, a tick's worth, rounded up.
 */
export function rampAllowedStepMmOf(ramp: RampFromReport): number {
  const gainedMmPerSecond =
    (ramp.acceleration * MM_PER_METRE * (ramp.ticksSinceReport + 1)) / TICKS_PER_SECOND
  return Math.ceil((ramp.reportedMmPerSecond + gainedMmPerSecond) / TICKS_PER_SECOND)
}
