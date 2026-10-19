/**
 * The drill law's cut speed (TD scope 0 on #316, ticket 333), in integer mm a tick: a cell of
 * `n` sub-steps (#330's rational drill time, `subStepsPerTile`) is 1 m cut in `n / Q` ticks, so
 * the drill advances `floor(1000 * Q / n)` mm a tick through it, `Q` the rig's drill quantum
 * (`drillQuantum.ts`, ticket 558). No float enters the authority: `n` comes from the `BigStat` drill
 * rule through `money.ts`.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'

/**
 * mm a tick the drill cuts through cells of `subStepsPerCell` sub-steps (1 cell = 1 m), counted in
 * `quantum` sub-steps a tick: the base 60, or the rig's lifted quantum (ticket 558).
 */
export function cutStepMmOf(
  subStepsPerCell: number,
  quantum: number = DRILL_SUBSTEPS_PER_TICK,
): number {
  return Math.floor((MM_PER_METRE * quantum) / subStepsPerCell)
}

/** Cells a second the drill cuts through cells of `subStepsPerCell` sub-steps of `quantum`. */
export function cutCellsPerSecondOf(subStepsPerCell: number, quantum: number): number {
  return (quantum * TICKS_PER_SECOND) / subStepsPerCell
}

/** A step in mm a tick as a speed in m/s, the unit the engine's `speedMax` is in. */
export function metresPerSecondOfStep(stepMm: number): number {
  return (stepMm * TICKS_PER_SECOND) / MM_PER_METRE
}
