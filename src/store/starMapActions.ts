/**
 * The game store's star-map actions (ticket 755), kept beside the store so it stays one reason to
 * change. Both are requests the host decides (the GD lock on #650): `buyFuel` at the Sell bay, and
 * `jumpToPlanet` to a planet of the session's own system. The store renders what the authority
 * answers; a refusal is logged as `command_rejected` and changes nothing.
 */
import { systemOfPlanet } from '../systems/authority/planetOfState'
import { buyFuelCommand, jumpToPlanetCommand } from '../systems/platform/platformCommands'
import { readAuthorityState, submitCommand } from './authorityLink'

export interface StarMapActions {
  /** Whole fuel units into the tank at this planet's price. */
  buyFuel(units: number): void
  /** The star map's jump to planet `planet` of the session's system, burning the tank's fuel. */
  jumpToPlanet(planet: number): void
}

export function starMapActionsOf(playerIdOf: () => string): StarMapActions {
  return {
    buyFuel: (units) => submitCommand(playerIdOf(), buyFuelCommand(units)),
    jumpToPlanet: (planet) => submitCommand(playerIdOf(), jumpInSessionSystem(planet)),
  }
}

function jumpInSessionSystem(planet: number) {
  return jumpToPlanetCommand(systemOfPlanet(readAuthorityState().planet), BigInt(planet))
}
