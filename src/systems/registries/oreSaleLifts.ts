/**
 * The ore sale lift sources (ticket 844; the TD ruling on #821, comment 6388180827, HS condition
 * 2): a data list, one row per source of a lift on an ore unit's sale price, so a new lift is a new
 * row and never a new code path. The sell kernel's one provider, `oreSaleLift`, folds the kernel's
 * own `assay_beacon` row and every registered row to the largest lift; lifts never stack.
 *
 * Each row says which units it pays. `every`: any unit of a tier it lifts (the beacon). `premium`:
 * only units the premium ledger counts, sold at the merchant of the planet they were mined on, and
 * never above the premium cap of 5/4 (VS on #821), which the kernel checks on every answer. A row's
 * lift is an integer ratio `num/den`, never a float.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { SaleLift } from '../economy/saleLift'
import { defineRegistry } from './seal'

export const SALE_LIFT_UNITS = ['every', 'premium'] as const
export type SaleLiftUnits = (typeof SALE_LIFT_UNITS)[number]

/** One tier of a sale at this player's Sell bay, as a source is asked about it. */
export interface SaleLiftQuery {
  state: AuthorityState
  playerId: string
  tier: number
}

export interface OreSaleLiftSource {
  /** `<slice>.<source>`; the kernel's own row is `kernel.assay_beacon`. */
  id: string
  pays: SaleLiftUnits
  /** The lift on the tier's units, or null where this source lifts nothing. */
  liftOf(query: SaleLiftQuery): SaleLift | null
}

export const ORE_SALE_LIFT_REGISTRY = defineRegistry<OreSaleLiftSource>('oreSaleLifts')
