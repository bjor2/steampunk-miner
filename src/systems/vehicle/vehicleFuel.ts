/**
 * The vehicle's fuel tank (ticket 755, the GD lock on #650): whole fuel units, bought with money at
 * the shop and burnt only by a star-map jump, never mined and never touched by drilling. A BigStat,
 * since the tank has no cap (VS input on #650). The key is absent while the tank is empty, so a
 * vehicle that never bought fuel digests as before and every save from before the star map holds an
 * empty tank.
 */
import {
  cmp,
  floor,
  fromCanonical,
  isNonNegativeMoneyText,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
} from '../money'
import type { VehicleState } from './vehicleState'

export function fuelOf(vehicle: Pick<VehicleState, 'fuel'>): BigStat {
  return vehicle.fuel ?? ZERO_MONEY
}

/** The vehicle holding `fuel`, the key dropped when the tank is empty. */
export function withFuel(vehicle: VehicleState, fuel: BigStat): VehicleState {
  const { fuel: _held, ...rest } = vehicle
  return cmp(fuel, ZERO_MONEY) > 0 ? { ...rest, fuel } : rest
}

export function hasFuelFor(vehicle: Pick<VehicleState, 'fuel'>, units: BigStat): boolean {
  return cmp(fuelOf(vehicle), units) >= 0
}

/** The tank as a snapshot writes it: canonical text under its key, or no key while empty. */
export function portableFuelField(fuel: BigStat | undefined): { fuel?: string } {
  return fuel === undefined ? {} : { fuel: toCanonical(fuel) }
}

export function fuelFieldOfPortable(fuel: string | undefined): { fuel?: BigStat } {
  return fuel === undefined ? {} : { fuel: fromCanonical(fuel) }
}

/** A snapshot's tank: absent, or a whole number of units above 0 as canonical text. */
export function isPortableFuel(fuel: unknown): boolean {
  if (fuel === undefined) return true
  if (!isNonNegativeMoneyText(fuel)) return false
  const units = fromCanonical(fuel as string)
  return cmp(units, ZERO_MONEY) > 0 && cmp(floor(units), units) === 0
}
