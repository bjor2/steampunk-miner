/**
 * The game store's blasting charge debug action (#109 scenarios), kept beside the store so it
 * stays one reason to change: it submits `debug.setCharges`, so it replays and logs
 * `debug_command_applied`, and a rack the authority would refuse throws with its problems. Buying
 * charges is play and goes through the Upgrade bay; planting is the B key.
 */
import { setChargesCommand } from '../systems/vehicle/vehicleCommands'
import { submitUnlessRefused } from './authorityLink'

export interface ChargeDebugActions {
  /** Debug: a bolted-on rack with `slotLevel` bought slots carrying `carried` charges of `size`. */
  setCharges(carried: number, slotLevel: number, size: number): void
}

export function chargeDebugActionsOf(playerIdOf: () => string): ChargeDebugActions {
  return {
    setCharges: (carried, slotLevel, size) =>
      submitUnlessRefused(playerIdOf(), setChargesCommand(carried, slotLevel, size)),
  }
}
