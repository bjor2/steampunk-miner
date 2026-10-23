/**
 * The vehicle's fuel tank (ticket 755, the GD lock on #650): whole fuel units, bought with money at
 * the shop and burnt only by a star-map jump, never mined and never touched by drilling. A BigStat,
 * since the tank track has no top level (VS input on #650). The key is absent while the tank is
 * empty, so a vehicle that never bought fuel digests as before and every save from before the star
 * map holds an empty tank.
 *
 * The tank's level (ticket 756) sets how much it holds (`economy/fuelTank.ts`); its key is absent at
 * the starting level 1, so every save from before the tank track holds the starting tank. The rig
 * draws it as the coal tender (#576 ladder) from `fuelTankLevelOf`.
 */
import { FIRST_FUEL_TANK_LEVEL, fuelTankCapacityOf } from '../economy/fuelTank'
import {
  add,
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

/** The tank's level: 1 until the first tank purchase. */
export function fuelTankLevelOf(vehicle: Pick<VehicleState, 'fuelTankLevel'>): number {
  return vehicle.fuelTankLevel ?? FIRST_FUEL_TANK_LEVEL
}

/** The vehicle on tank `level`, the key dropped at the starting level. */
export function withFuelTankLevel(vehicle: VehicleState, level: number): VehicleState {
  const { fuelTankLevel: _held, ...rest } = vehicle
  return level > FIRST_FUEL_TANK_LEVEL ? { ...rest, fuelTankLevel: level } : rest
}

/** Whole fuel units the vehicle's tank holds at most. */
export function fuelCapacityOf(vehicle: Pick<VehicleState, 'fuelTankLevel'>): BigStat {
  return fuelTankCapacityOf(fuelTankLevelOf(vehicle))
}

/** Whether `units` more fit in the tank; a tank over its capacity from an older save takes none. */
export function hasRoomFor(
  vehicle: Pick<VehicleState, 'fuel' | 'fuelTankLevel'>,
  units: BigStat,
): boolean {
  return cmp(add(fuelOf(vehicle), units), fuelCapacityOf(vehicle)) <= 0
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

/** A snapshot's tank level: absent at level 1, or a whole level from 2. */
export function isPortableFuelTankLevel(level: unknown): boolean {
  if (level === undefined) return true
  return Number.isSafeInteger(level) && (level as number) > FIRST_FUEL_TANK_LEVEL
}
