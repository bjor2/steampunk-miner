/**
 * The game store's star-map actions (ticket 755), kept beside the store so it stays one reason to
 * change. Each is a request the host decides (the GD lock on #650): `buyFuel`, since ticket 756
 * `buyFuelTank` and since ticket 759 `buyJumpDrive` at the Sell bay, `jumpToPlanet` to a planet of
 * the session's own system, and `jumpToSystemPlanet` to a planet of any system, which needs the
 * jump drive. The store renders what the authority answers; a refusal is logged as
 * `command_rejected` and changes nothing.
 */
import { systemOfPlanet } from '../systems/authority/planetOfState'
import {
  buyFuelCommand,
  buyFuelTankCommand,
  buyJumpDriveCommand,
  jumpToPlanetCommand,
} from '../systems/platform/platformCommands'
import { readAuthorityState, submitCommand } from './authorityLink'

export interface StarMapActions {
  /** Whole fuel units into the tank at this planet's price. */
  buyFuel(units: number): void
  /** The tank track's next level, so the tank holds more fuel. */
  buyFuelTank(): void
  /** The jump drive, fitted once, so the vehicle's jumps may cross into another solar system. */
  buyJumpDrive(): void
  /** The star map's jump to planet `planet` of the session's system, burning the tank's fuel. */
  jumpToPlanet(planet: number): void
  /** The jump to place `planet` of solar system `system`, between systems with the jump drive. */
  jumpToSystemPlanet(system: number, planet: number): void
}

export function starMapActionsOf(playerIdOf: () => string): StarMapActions {
  return {
    buyFuel: (units) => submitCommand(playerIdOf(), buyFuelCommand(units)),
    buyFuelTank: () => submitCommand(playerIdOf(), buyFuelTankCommand()),
    buyJumpDrive: () => submitCommand(playerIdOf(), buyJumpDriveCommand()),
    jumpToPlanet: (planet) => submitCommand(playerIdOf(), jumpInSessionSystem(planet)),
    jumpToSystemPlanet: (system, planet) =>
      submitCommand(playerIdOf(), jumpToPlanetCommand(BigInt(system), BigInt(planet))),
  }
}

function jumpInSessionSystem(planet: number) {
  return jumpToPlanetCommand(systemOfPlanet(readAuthorityState().planet), BigInt(planet))
}
