/**
 * The game store's ground debug actions (#36), kept beside the store so it stays one reason to
 * change: each submits a `debug.*` authority command, so it replays and logs
 * `debug_command_applied`, and a call the authority would refuse throws with its problems.
 */
import {
  carveCircleCommand,
  fillCircleCommand,
  type GroundCircle,
} from '../systems/authority/groundCommands'
import { submitUnlessRefused } from './authorityLink'

export interface GroundDebugActions {
  /** Debug: lowers density in a disc round a point in mm, never below air or into the pad. */
  carveCircle(circle: GroundCircle): void
  /** Debug: raises density in a disc round a point in mm, up to solid ground. */
  fillCircle(circle: GroundCircle): void
}

export function groundDebugActionsOf(playerIdOf: () => string): GroundDebugActions {
  return {
    carveCircle: (circle) => submitUnlessRefused(playerIdOf(), carveCircleCommand(circle)),
    fillCircle: (circle) => submitUnlessRefused(playerIdOf(), fillCircleCommand(circle)),
  }
}
