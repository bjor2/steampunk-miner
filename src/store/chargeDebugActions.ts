/**
 * The game store's blasting charge debug actions (#109 scenarios), kept beside the store so they
 * stay one reason to change: they submit `debug.setCharges` and `debug.setBlastRadiusLevel` (D9
 * #869), so they replay and log `debug_command_applied`, and a rack the authority would refuse
 * throws with its problems. Buying charges and levels is play and goes through the Upgrade bay;
 * planting is the B key.
 */
import { setBlastRadiusLevelCommand, setChargesCommand } from '../systems/vehicle/vehicleCommands'
import { submitUnlessRefused } from './authorityLink'

export interface ChargeDebugActions {
  /** Debug: a bolted-on rack with `slotLevel` bought slots carrying `carried` charges of `size`. */
  setCharges(carried: number, slotLevel: number, size: number): void
  /** Debug: the rig's Blast Radius level, which every blast it sets off reads. */
  setBlastRadiusLevel(level: number): void
}

export function chargeDebugActionsOf(playerIdOf: () => string): ChargeDebugActions {
  return {
    setCharges: (carried, slotLevel, size) =>
      submitUnlessRefused(playerIdOf(), setChargesCommand(carried, slotLevel, size)),
    setBlastRadiusLevel: (level) =>
      submitUnlessRefused(playerIdOf(), setBlastRadiusLevelCommand(level)),
  }
}
