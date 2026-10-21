/**
 * The strip's next-upgrade chip (spec #678, ticket 684; GD ruling of 21 Oct 18:33): on the surface
 * and at the dock, beside the money, the cheaper of the drill's two tracks (drill power, drill
 * tip) as its track icon and its price, with no label. The price rounds up (ticket 681), so the
 * chip never reads cheaper than the Outfitter's bill.
 */
import type { AuthorityState } from '../authority/authorityState'
import { nextUpgradePrice } from '../authority/workshopRules'
import { trackIconIdOf } from '../art/icons/iconSet'
import type { UpgradeId } from '../economy/economyDefinition'
import { cmp, type Money } from '../money'
import { priceReading, type AmountReading } from './viewParts'

export interface NextUpgradeChip {
  upgradeId: UpgradeId
  iconId: string
  price: AmountReading
}

/** The drill's tracks, in the order a tie keeps: the drill first, then its tip. */
const DRILL_TRACKS: readonly UpgradeId[] = ['drill_power', 'drill_tip']

export function nextUpgradeChipOf(state: AuthorityState, playerId: string): NextUpgradeChip {
  const offers = DRILL_TRACKS.map((upgradeId) => ({
    upgradeId,
    price: nextUpgradePrice(state, playerId, upgradeId),
  }))
  const cheapest = offers.reduce((kept, offer) =>
    isCheaper(offer.price, kept.price) ? offer : kept,
  )
  return {
    upgradeId: cheapest.upgradeId,
    iconId: trackIconIdOf(cheapest.upgradeId),
    price: priceReading(cheapest.price),
  }
}

function isCheaper(price: Money, than: Money): boolean {
  return cmp(price, than) < 0
}
