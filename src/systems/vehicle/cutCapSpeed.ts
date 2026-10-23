/**
 * The drive's speed and the cut caps it sets (Bjor's ruling on #723, replacing travel parity of
 * ticket 333): the drive moves the rig at the engine's top speed and nothing else, so buying drill
 * speed never changes it; a sideways cut moves at `min(vCut, speedMax)` (`cutAxisCaps.ts`), and a
 * cut down or up at the drill's `vCut` alone.
 *
 * The body follows the capped speed in m/s; the swept cut's front steps the drive's top speed in
 * whole mm a tick rounded up, so the front never lags the body it cuts for.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { isDriveCappedFacing } from './cutAxisCaps'
import type { Facing } from './vehiclePose'
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

/** m/s a cut along `facing` moves at: the drill's `vCut`, held to the drive's sideways. */
export function cappedCutSpeedOf(facing: Facing, cutSpeed: number, driveSpeed: number): number {
  return isDriveCappedFacing(facing) ? Math.min(cutSpeed, driveSpeed) : cutSpeed
}

/** mm a tick a cut's front steps along `facing`: the drill's, held to the drive's sideways. */
export function cappedCutStepMmOf(facing: Facing, cutStepMm: number, driveSpeed: number): number {
  return isDriveCappedFacing(facing) ? Math.min(cutStepMm, driveStepMmOf(driveSpeed)) : cutStepMm
}

/** Whether the drive, not the drill, sets a cut's speed along `facing`. */
export function isCutDriveBound(facing: Facing, cutSpeed: number, driveSpeed: number): boolean {
  return isDriveCappedFacing(facing) && cutSpeed > driveSpeed
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
