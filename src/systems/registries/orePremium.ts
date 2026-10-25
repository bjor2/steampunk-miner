/**
 * Which mined units a planet's merchant pays a premium on (ticket 844, the TD ruling on #821,
 * comment 6388180827 as amended by 6388185794): the slice that owns the merchants answers, for a
 * unit about to be stored, the premium species its cell wears on this planet, or null. The kernel
 * asks once per unit in `collectOreUnit`, after the unit reached the hold, and counts the answer in
 * the player's premium ledger under the planet's `s:p`; the price is set only at the sale
 * (`oreSaleLifts`). With no provider no unit is counted and the state is untouched.
 *
 * The answer only counts: it never prices, refuses or stops a unit.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { MinedOre } from '../authority/minedOre'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface OrePremiumProvider {
  id: string
  /** The premium species the unit's cell wears on the session's planet, or null. */
  premiumSpeciesOf(state: AuthorityState, playerId: string, ore: MinedOre): string | null
}

export const ORE_PREMIUM_REGISTRY = defineOneProviderRegistry<OrePremiumProvider>('orePremium')

/** The unit's premium species, or null: none when no slice provides the seam. */
export function premiumSpeciesOfUnit(
  state: AuthorityState,
  playerId: string,
  ore: MinedOre,
): string | null {
  const [provider] = entriesOf(ORE_PREMIUM_REGISTRY)
  return provider === undefined ? null : provider.premiumSpeciesOf(state, playerId, ore)
}
