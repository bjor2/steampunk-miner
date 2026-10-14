/**
 * The chronometric governor's slow pocket (#263 "Slow", kernel half #360): an enemy inside the
 * pocket keeps `enemySlowBp` of its step (`src/data/aetheric.json`, half speed), rounded down to
 * whole millimetres. The vehicle is never an input, so its motion, the #233 motion cap and #333's
 * travel are untouched. O(1) per call; nothing calls it until the power-up is registered (#263).
 */
import AETHERIC_TUNING from '../../data/aetheric.json'
import { BASIS_POINTS } from '../../constants/balance'

/** An enemy's step this tick in whole millimetres, slowed when it stands in the pocket. */
export function slowedEnemyStep(step: number, inPocket: boolean): number {
  return inPocket ? slowStep(step) : step
}

function slowStep(step: number): number {
  return Math.floor((step * AETHERIC_TUNING.enemySlowBp) / BASIS_POINTS)
}
