/**
 * The premium ledger rides with a container's cargo (ticket 844; Systems' crate rule on #821,
 * comment 6388171635, and the TD amendment 6388185794): a drop moves every count of the hold's
 * ledger into the container under the same `(originS, originP, speciesId)` key, and a pickup moves
 * them back, per tier at most the units that tier moved, in ascending key order. A container never
 * debits: the premium is paid once, at the origin's merchant, whoever carries it there.
 *
 * Pure: the counts come in and go out beside the cargo they count.
 */
import {
  EMPTY_PREMIUM_LEDGER,
  takePremiumOfTier,
  withPremiumCounts,
  type PremiumLedger,
  type PremiumTake,
} from '../../../systems/authority/premium/premiumLedger'
import type { Cargo } from '../../../systems/vehicle/vehicleState'

/** The counts moved with `moved`: per tier up to its units, the lowest key first. */
export function premiumMovedWith(premium: PremiumLedger, moved: Cargo): PremiumTake {
  return Object.entries(moved.ore).reduce<PremiumTake>(
    (take, [tier, units]) => {
      const tierTake = takePremiumOfTier(take.left, Number.parseInt(tier, 10), units)
      return { taken: withPremiumCounts(take.taken, tierTake.taken), left: tierTake.left }
    },
    { taken: EMPTY_PREMIUM_LEDGER, left: premium },
  )
}

/** A container's counts under its optional key, left out while there are none. */
export function premiumFieldOf(premium: PremiumLedger): { premium?: PremiumLedger } {
  return premium.length === 0 ? {} : { premium }
}
