/**
 * The lining type the vehicle lays (#113: a type on top of the #41 grade). Every vehicle starts
 * with the standard lining; an archetype's type (refractory for the Fire act) is unlocked once at
 * the Upgrade bay and then picked there as the active type, which every ring laid from then on
 * uses. The casing layer stores a type by its index in `liningTypes()`, the standard one first.
 *
 * Each archetype type is a casing_cement grade (ticket 366): refractory is grade 1 on its P8 row,
 * insulated and grounded grades 2 and 3 on their P17 and P25 rows once their acts bring the type.
 */
import { liningTypes, STANDARD_LINING_TYPE } from '../economy/heatEconomy'

export interface VehicleLining {
  /** The type rings are laid in now. */
  active: string
  /** The types unlocked, the standard one always among them, in `liningTypes()` order. */
  owned: readonly string[]
}

export const STANDARD_LINING: VehicleLining = {
  active: STANDARD_LINING_TYPE,
  owned: [STANDARD_LINING_TYPE],
}

export function isLiningType(value: unknown): value is string {
  return typeof value === 'string' && liningTypes().includes(value)
}

/** The casing layer's index of a lining type (#113); the standard lining is 0. */
export function liningTypeIndexOf(liningType: string): number {
  const index = liningTypes().indexOf(liningType)
  if (index < 0) throw new RangeError(`no lining type ${liningType}`)
  return index
}

/** The lining type the casing layer's `typeIndex` stands for, or null for an unknown index. */
export function liningTypeOfIndex(typeIndex: number): string | null {
  return liningTypes()[typeIndex] ?? null
}

export function isLiningTypeOwned(lining: VehicleLining, liningType: string): boolean {
  return lining.owned.includes(liningType)
}

/** The lining with `liningType` unlocked too, kept in `liningTypes()` order. */
export function withLiningTypeOwned(lining: VehicleLining, liningType: string): VehicleLining {
  const owned = liningTypes().filter((type) => type === liningType || lining.owned.includes(type))
  return { ...lining, owned }
}

/**
 * The schedule row that opens a lining type: `refractory_lining` for refractory (#80). The row is
 * the casing_cement grade's row; the grade has no id of its own (ticket 366).
 */
export function liningRowIdOf(liningType: string): string {
  return `${liningType}_lining`
}
