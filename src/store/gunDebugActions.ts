/**
 * The game store's gun debug action (#107 combat scenarios), kept beside the store so it stays one
 * reason to change: it submits `debug.setGunLevel`, so it replays and logs
 * `debug_command_applied`, and a level the authority would refuse throws with its problems. Buying
 * the guns is play and goes through the Upgrade bay's Guns row; switching them is the G key.
 */
import { setGunLevelCommand } from '../systems/vehicle/vehicleCommands'
import { submitUnlessRefused } from './authorityLink'

export interface GunDebugActions {
  /** Debug: the guns at `level`, 0 (none) to the gun track's cap, with no unlock or price. */
  setGunLevel(level: number): void
}

export function gunDebugActionsOf(playerIdOf: () => string): GunDebugActions {
  return {
    setGunLevel: (level) => submitUnlessRefused(playerIdOf(), setGunLevelCommand(level)),
  }
}
