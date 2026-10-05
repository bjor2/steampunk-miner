/**
 * The game store's casing debug actions (#41), kept beside the store so it stays one reason to
 * change: each submits a `debug.*` authority command, so it replays and logs
 * `debug_command_applied`, and a call the authority would refuse throws with its problems. Buying
 * a grade is play and goes through the Upgrade bay's action.
 */
import {
  lineCasingCommand,
  setCasingGradeCommand,
  type CasingRingAt,
} from '../systems/authority/casingDebugCommands'
import { submitUnlessRefused } from './authorityLink'

export interface CasingDebugActions {
  /** Debug: the vehicle's casing grade, a whole number >= 1. */
  setCasingGrade(grade: number): void
  /** Debug: one ring of lining of `grade` round a point in mm, the ring the vehicle lays. */
  lineCasing(ring: CasingRingAt): void
}

export function casingDebugActionsOf(playerIdOf: () => string): CasingDebugActions {
  return {
    setCasingGrade: (grade) => submitUnlessRefused(playerIdOf(), setCasingGradeCommand(grade)),
    lineCasing: (ring) => submitUnlessRefused(playerIdOf(), lineCasingCommand(ring)),
  }
}
