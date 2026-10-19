/**
 * The swept cut's rim dwell (ticket 441, the TD shape on #441 with the VS and HS rulings), integer
 * arithmetic only: a sample the stamp touches is charged the work spent while the stamp's centre
 * stood within its radius, not a whole tick's sub-steps whatever the capsule's length.
 *
 * - A tick's dwell at a sample, `D`, is the sum over the stations its centre paid from (the swept
 *   cut's ledger, `vehicle/sweepDwell.ts`) of each station's work in sub-steps times the bare disc's
 *   falloff weight there (0..256, 0 past the radius).
 * - The removal keeps `groundEdit.ts`'s tick clock: from the phase `P = Q T0` at the sample's own
 *   weight `w`, `floor(255 (w P + D) / (W n)) - floor(255 w P / (W n))`, never below the sample's
 *   floor. One station spending a whole tick (`Q` sub-steps) at the sample's weight is the
 *   whole-tick charge exactly; the phase carries fractions on average without per-sample state,
 *   taken modulo `W n` (`carvePhase.ts`) so it stays exact at any quantum and tick (ticket 558).
 * - A sample no station reaches, `D = 0`, is not cut, though its gates are still asked as the stamp
 *   meets it, so `DrillGated` stays per cell and in walk order.
 */
import { productModuloOf } from './carvePhase'
import type { CarveWindow, StampWalk } from './groundEdit'
import { SOLID_DENSITY } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'

/** The work dwelt at sample `(sx, sy)`: sub-steps times falloff weight, summed over stations. */
export type SampleDwell = (sx: number, sy: number) => number

/** What the sample's dwell removes from it this window, before its density and floor clamp it. */
export function dwellRemovalOf(
  sample: WeightedSample,
  window: CarveWindow,
  drillTicks: number,
): number {
  const dwell = window.dwellAt?.(sample.sx, sample.sy) ?? 0
  if (dwell === 0) return 0
  const per = FULL_WEIGHT * drillTicks
  const perTick = SOLID_DENSITY * sample.weight * (window.subStepsPerTick ?? 1)
  const phase = productModuloOf(perTick, window.firstTick, per)
  return Math.floor((phase + SOLID_DENSITY * dwell) / per)
}

/** `walk` with every sample of its stamp charged by `dwellAt`; cells carved beside it are not. */
export function chargingByDwell(dwellAt: SampleDwell, walk: StampWalk): StampWalk {
  return (session, disc, window, drillTicksOf) =>
    walk(session, disc, { ...window, dwellAt }, drillTicksOf)
}
