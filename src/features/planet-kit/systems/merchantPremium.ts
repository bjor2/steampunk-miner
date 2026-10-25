/**
 * The merchant's ore premium on the kernel's ledger and sale-lift seams (ticket 821, PK2; the TD
 * ruling on #821, comment 6388180827 as amended by 6388185794; kernel #844). Systems' locked kits:
 * +25% on the planet's own premium ore only, once per ore, never stacked with the assay beacon.
 *
 * - **Counting.** A mined unit is counted when the cell's species, as the roster names it on this
 *   planet (`planetSpeciesOf`), is the premium ore of the merchant trading here. The kernel keys
 *   the count by the unit's origin (s,p).
 * - **Paying.** The premium row pays `(10000 + liftBp) / 10000` (5/4) wherever a merchant trades;
 *   the kernel asks it only for units counted on the planet of the sale, folds it with the beacon
 *   by max and debits the counts it paid, so the premium is paid once, at the origin's merchant.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { MinedOre } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { SaleLift } from '../../../systems/economy/saleLift'
import { add, div, fromSafeInteger, integerRatioOf } from '../../../systems/money'
import type { OrePremiumProvider } from '../../../systems/registries/orePremium'
import type { OreSaleLiftSource } from '../../../systems/registries/oreSaleLifts'
import { planetSpeciesOf } from '../../roster'
import type { PlanetId } from '../../solar-systems'
import { PLANET_KITS } from './planetKitRows'
import { merchantOfPlanet } from './planetKitSales'
import type { PlanetKits } from './planetKitTypes'
import { sessionMerchantOf } from './sessionMerchant'

const BASIS_POINTS = 10_000

/** The premium as the integer ratio the sell kernel folds: 2500 bp is 5/4. */
export function merchantPremiumLiftOf(kits: PlanetKits): SaleLift {
  const whole = fromSafeInteger(BASIS_POINTS)
  return integerRatioOf(div(add(whole, fromSafeInteger(kits.premiumLiftBp)), whole))
}

/** `speciesId` when the merchant on `planet` pays its premium on it; null for any other ore. */
export function premiumSpeciesAt(
  kits: PlanetKits,
  planet: PlanetId,
  speciesId: string | null,
): string | null {
  const merchant = merchantOfPlanet(kits, planet)
  return merchant !== null && merchant.premiumOre.speciesId === speciesId ? speciesId : null
}

/** The premium species `ore` is counted as on the session's planet, or null. */
export function premiumSpeciesOfMinedUnit(
  kits: PlanetKits,
  state: AuthorityState,
  ore: MinedOre,
): string | null {
  const merchant = sessionMerchantOf(kits, state)
  if (merchant === null) return null
  return premiumSpeciesAt(kits, merchant.planet, speciesOfMinedUnit(state, ore))
}

/** The premium lift where a merchant trades; null where none does. */
export function merchantPremiumLiftHere(kits: PlanetKits, state: AuthorityState): SaleLift | null {
  return sessionMerchantOf(kits, state) === null ? null : merchantPremiumLiftOf(kits)
}

/** The ledger seam's one provider: the premium species of each mined unit. */
export const MERCHANT_ORE_PREMIUM: OrePremiumProvider = {
  id: 'planet-kit.merchant-premium',
  premiumSpeciesOf: (state, _playerId, ore) => premiumSpeciesOfMinedUnit(PLANET_KITS, state, ore),
}

/** The sale-lift row: pays the premium on the units the ledger counted here. */
export const MERCHANT_PREMIUM_LIFT: OreSaleLiftSource = {
  id: 'planet-kit.merchant-premium',
  pays: 'premium',
  liftOf: ({ state }) => merchantPremiumLiftHere(PLANET_KITS, state),
}

function speciesOfMinedUnit(state: AuthorityState, ore: MinedOre): string | null {
  const params = planetParamsOf(state.planet)
  return params === null ? null : (planetSpeciesOf(params, ore.kindSlot)?.id ?? null)
}
