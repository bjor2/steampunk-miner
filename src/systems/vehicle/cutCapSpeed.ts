/**
 * The drive's speed and the cut caps it sets (Bjor's ruling on #723, replacing travel parity of
 * ticket 333): the drive moves the rig at the engine's top speed and nothing else, so buying drill
 * speed never changes it; a sideways cut moves at `min(vCut, speedMax)` (`cutAxisCaps.ts`), and a
 * cut down or up at the drill's `vCut` alone.
 *
 * The body follows the capped speed in m/s; the swept cut's front steps the drive's top speed in
 * whole mm a tick rounded up, so the front never lags the body it cuts for.
 *
 * A diagonal cut (ticket 791) is held so its sideways part never passes the drive (Bjor's rule
 * holds on the sideways part of a diagonal): its speed along the aim is at most the drive's over
 * the aim's sideways share. Straight sideways that share is 1 and the cap is the drive's exactly.
 */
import { MM_PER_METRE, TICKS_PER_SECOND, UP_VECTOR_SCALE } from '../../constants/physics'
import { aimDirectionOf, type Aim } from './aim'
import { isDriveCappedAim } from './cutAxisCaps'
import { statsOfVehicle, type VehicleState } from './vehicleState'

/** m/s the drive moves the rig at: the engine's top speed, whatever the drill. */
export function driveSpeedOf(vehicle: VehicleState): number {
  return statsOfVehicle(vehicle).engine.speedMax
}

/** Ticks the drive takes over one metre at its top speed: the felt time of a drive-bound metre. */
export function driveTicksPerMetreOf(speedMax: number): number {
  return TICKS_PER_SECOND / speedMax
}

/** A top speed in whole mm a tick, rounded up so a body at that speed always fits the step. */
export function driveStepMmOf(speedMax: number): number {
  return Math.ceil((speedMax * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** m/s a cut along `aim` moves at: the drill's `vCut`, its sideways part held to the drive's. */
export function cappedCutSpeedOf(aim: Aim, cutSpeed: number, driveSpeed: number): number {
  return isDriveCappedAim(aim) ? Math.min(cutSpeed, alongAimOfSideways(aim, driveSpeed)) : cutSpeed
}

/** mm a tick a cut's front steps along `aim`: the drill's, its sideways part held to the drive's. */
export function cappedCutStepMmOf(aim: Aim, cutStepMm: number, driveSpeed: number): number {
  if (!isDriveCappedAim(aim)) return cutStepMm
  return Math.min(cutStepMm, Math.ceil(alongAimOfSideways(aim, driveStepMmOf(driveSpeed))))
}

/** Whether the drive, not the drill, sets a cut's speed along `aim`. */
export function isCutDriveBound(aim: Aim, cutSpeed: number, driveSpeed: number): boolean {
  return isDriveCappedAim(aim) && cutSpeed > alongAimOfSideways(aim, driveSpeed)
}

/**
 * How fast along the aim a cut goes whose sideways part goes at `sideways`: that over the aim's
 * sideways share, at the 1024 scale; `sideways` itself straight sideways.
 */
function alongAimOfSideways(aim: Aim, sideways: number): number {
  return (sideways * UP_VECTOR_SCALE) / Math.abs(aimDirectionOf(aim).along)
}

/**
 * Sub-steps of `quantum` the drive takes over one 1 m cell at its top speed, rounded up: the
 * scripted clock's time for a sideways cell the drill would cut faster (`boreClock.ts`).
 */
export function driveSubStepsPerCellOf(speedMax: number, quantum: number): number {
  return Math.ceil((MM_PER_METRE * quantum) / driveStepMmOf(speedMax))
}

/** A sideways cell's sub-steps: the drill's, or the drive's where the drive is slower. */
export function sidewaysSubStepsOf(
  drillSubSteps: number,
  speedMax: number,
  quantum: number,
): number {
  return Math.max(drillSubSteps, driveSubStepsPerCellOf(speedMax, quantum))
}
