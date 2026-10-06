/**
 * The game store's heat-planet debug actions (#113 scenarios), kept beside the store so it stays
 * one reason to change: each submits a `debug.*` command, so it replays and logs
 * `debug_command_applied`, and a value the authority would refuse throws with its problems.
 * Unlocking and picking a lining type is play and goes through the Upgrade bay's Lining row.
 */
import { setHeatCommand, setLiningTypeCommand } from '../systems/vehicle/vehicleCommands'
import { submitUnlessRefused } from './authorityLink'

export interface HeatDebugActions {
  /** Debug: the lining type owned and laid from now on, with no unlock or price. */
  setLiningType(liningType: string): void
  /** Debug: the heat gauge at `heat` whole points, 0 to its max (0 off the heat planets). */
  setHeat(heat: number): void
}

export function heatDebugActionsOf(playerIdOf: () => string): HeatDebugActions {
  return {
    setLiningType: (liningType) =>
      submitUnlessRefused(playerIdOf(), setLiningTypeCommand(liningType)),
    setHeat: (heat) => submitUnlessRefused(playerIdOf(), setHeatCommand(heat)),
  }
}
