/**
 * The game store's hazard scenario call (ticket 848), kept beside the store so it stays one reason
 * to change: placing a hazard submits `debug.placeHazard`, so it replays and logs
 * `debug_command_applied` and throws when the authority refuses it.
 */
import { placeHazardCommand } from '../systems/authority/hazards/hazardDebugRules'
import { submitUnlessRefused } from './authorityLink'

export interface HazardDebugActions {
  /** Debug: a hazard of `kind` in the cell `tx, ty`, read before the planet's own pockets. */
  placeHazard(kind: string, tx: number, ty: number): void
}

export function hazardDebugActionsOf(playerIdOf: () => string): HazardDebugActions {
  return {
    placeHazard: (kind, tx, ty) =>
      submitUnlessRefused(playerIdOf(), placeHazardCommand(kind, tx, ty)),
  }
}
