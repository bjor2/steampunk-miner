/**
 * The swept carve charges the carry it keeps (ticket 466, fix A: the TD shape 6208695039 on #466,
 * confirmed by the GD in 6208709630 and 6209400700), pure and integer. The dwell ledger's carry
 * station (`vehicle/sweepDwell.ts`) is built before the carve, and the release clamp
 * (`carryRelease.ts`, ticket 421) needs the carved world to shrink the carry it stores, to what the
 * stamp left of a released cell or to 0 at a gate. So a tick whose clamp lowers the carry is carved
 * once more, its ledger charging the clamped carry.
 *
 * - **The stored carry is the first clamp's**, byte-identical to the carve without the ledger: a
 *   less-cut target leaves at least as much, so it never exceeds what the second carve leaves.
 * - **The second carve starts from the same request world**; only the carry station's work changes,
 *   so it only lowers the rim's dwell. Gates are asked once per cell (`cellGates.ts`), so no
 *   `DrillGated` is asked or reported twice, and the walk's paid cells, events and yield order stay
 *   as the walk left them.
 * - A tick whose clamp keeps the carry is carved once. No constant, no state: what a later tick
 *   drops of the carry it is handed counts as spent here (`droppedCarryInOf`).
 *
 * The swept carve takes it with #441's wiring; until then only the conservation specs call it.
 */
import type { CarryReach } from '../vehicle/carryWalk'

/** A tick's carve, and its reach with the carry the clamp keeps. */
export interface ChargedCarve<Carved> {
  carved: Carved
  clamped: CarryReach
}

/** Carves a tick charging `charged`'s carry at its carry station. */
export type CarveCharging<Carved> = (charged: CarryReach) => Carved

/** The walk's reach with its carry clamped on the carved world. */
export type CarryClamp<Carved> = (carved: Carved) => CarryReach

/** The tick carved charging the carry its clamp keeps: once, or again when the clamp lowers it. */
export function chargedCarveOf<Carved>(
  carve: CarveCharging<Carved>,
  clampOf: CarryClamp<Carved>,
  reach: CarryReach,
): ChargedCarve<Carved> {
  const carved = carve(reach)
  return recarvedAtClamp(carve, reach, { carved, clamped: clampOf(carved) })
}

/** The first carve when its clamp kept the walk's carry, else the tick carved charging the clamp's. */
function recarvedAtClamp<Carved>(
  carve: CarveCharging<Carved>,
  reach: CarryReach,
  first: ChargedCarve<Carved>,
): ChargedCarve<Carved> {
  const { carrySubSteps } = first.clamped
  if (carrySubSteps >= reach.carrySubSteps) return first
  return { carved: carve({ ...reach, carrySubSteps }), clamped: first.clamped }
}
