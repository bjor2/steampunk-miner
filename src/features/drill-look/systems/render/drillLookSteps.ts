/**
 * The drill's look steps (#554, GD on #551 point 9 "visible progression"), now the `drill_power`
 * row block of the rig look table (`rig-look`'s `rigLook.json`, ticket 577), which paints them:
 * each row a glow in its own colour on the bit and the head plate, brighter row by row. The unit
 * is one purchase, the stored `drill_power` step (#552). A stage counts every row reached; past
 * the last row the rig look's linear tail takes over (GD on #577). Presentation only: nothing
 * here reaches a command, a log line, a digest or a save.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import {
  ownedPurchasesOf,
  rigLookIndexOf,
  SHIPPED_RIG_LOOKS,
  trackLookFramesOf,
  type RigLookStepRow,
  type TrackLookRows,
} from '../../../rig-look'

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

export const DRILL_LOOK_TRACK = 'drill_power'

const DRILL_LOOK_ROWS: TrackLookRows = drillPowerRows()

/** The thresholds, rising; the GD retunes them in `rigLook.json`. */
export const DRILL_LOOK_STEPS: readonly DrillLookStep[] = DRILL_LOOK_ROWS.steps.map(drillStepOf)

/** The look stage at `purchases`: 0 below the first threshold, else the rows reached. */
export function drillLookStageOf(
  purchases: number,
  steps: readonly DrillLookStep[] = DRILL_LOOK_STEPS,
): number {
  return rigLookIndexOf(rowsWithSteps(steps), purchases).step
}

/** The stage `playerId`'s drill shows, 0 for a player not in the state. */
export function drillLookStageOfPlayer(state: AuthorityState, playerId: string): number {
  return drillLookStageOf(ownedPurchasesOf(state, playerId, DRILL_LOOK_TRACK))
}

function drillPowerRows(): TrackLookRows {
  const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, DRILL_LOOK_TRACK)
  if (frames === null) throw new Error(`rigLook.json has no ${DRILL_LOOK_TRACK} rows`)
  return frames.rows
}

function drillStepOf(row: RigLookStepRow): DrillLookStep {
  const [bitGlow, headGlow] = row.glows
  return { fromPurchase: row.from, colour: row.colour, bitGlow, headGlow }
}

function rowsWithSteps(steps: readonly DrillLookStep[]): TrackLookRows {
  if (steps === DRILL_LOOK_STEPS) return DRILL_LOOK_ROWS
  return { ...DRILL_LOOK_ROWS, steps: steps.map(rowOfDrillStep) }
}

function rowOfDrillStep(step: DrillLookStep): RigLookStepRow {
  const glows = [step.bitGlow, step.headGlow]
  return { from: step.fromPurchase, part: null, card: null, colour: step.colour, glows }
}
