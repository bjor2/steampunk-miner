/**
 * The drill's look steps (#554, GD on #551 point 9 "visible progression"): one table of purchase
 * thresholds, `drillLook.json`, each row a glow in its own colour on the bit and the head plate,
 * brighter row by row. The unit is one purchase, the stored `drill_power` step (#552). A step
 * counts every row reached, so the look past the last row is the last row's, and adding a row is
 * the only way to add a look. Steady glows, no pulse, so reduced motion and reduced effects show
 * the same look. Presentation only: nothing here reaches a command, a log line, a digest or a save.
 */
import type { VehicleLook } from '../../../../systems/registries/vehicleLooks'
import DRILL_LOOK_FILE from '../../drillLook.json'

export interface DrillLookStep {
  /** The purchase count from which this look shows. */
  fromPurchase: number
  /** `#rrggbb` of the glow on the bit and the head. */
  colour: string
  /** Added to the bit's own glow, 1 being its colour at full. */
  bitGlow: number
  /** Added to the head plate's own glow. */
  headGlow: number
}

/** The thresholds, rising; the GD retunes them in `drillLook.json`. */
export const DRILL_LOOK_STEPS: readonly DrillLookStep[] = DRILL_LOOK_FILE.steps

export const DRILL_BIT_SLOTS: readonly string[] = ['drill-bit']
export const DRILL_HEAD_SLOTS: readonly string[] = ['drill-head']

/** The look stage at `purchases`: 0 below the first threshold, else the rows reached. */
export function drillLookStageOf(
  purchases: number,
  steps: readonly DrillLookStep[] = DRILL_LOOK_STEPS,
): number {
  return steps.filter((step) => purchases >= step.fromPurchase).length
}

/** Each stage's look, made once (stage 0 is no look), as the kernel asks for kept looks. */
export function createDrillLooks(
  steps: readonly DrillLookStep[] = DRILL_LOOK_STEPS,
): readonly (VehicleLook | null)[] {
  return [null, ...steps.map(lookOfStep)]
}

function lookOfStep(step: DrillLookStep): VehicleLook {
  return {
    tint: null,
    opacity: 1,
    outline: null,
    glows: [
      { slots: DRILL_BIT_SLOTS, colour: step.colour, glow: step.bitGlow },
      { slots: DRILL_HEAD_SLOTS, colour: step.colour, glow: step.headGlow },
    ],
  }
}
