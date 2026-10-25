/**
 * Holds specs set up by hand (ticket 849): the hold counts units as bigint, so a spec writes its
 * small counts as plain numbers and this reads them into the kernel's `Cargo`.
 */
import type { Cargo } from './vehicleState'

/** `units` per tier as the hold's bigint counts. */
export function oreUnitsFrom(units: Readonly<Record<string | number, number>>): Cargo['ore'] {
  return Object.fromEntries(Object.entries(units).map(([tier, count]) => [tier, BigInt(count)]))
}
