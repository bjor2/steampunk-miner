/**
 * The strip's next-upgrade chip (spec #678, ticket 684; GD ruling of 21 Oct 18:33): on the surface
 * and at the dock, beside the money, its icon and its price, with no label on the strip. It puts
 * the cheapest new capability the rig lacks first (Progression 2, ticket 719: an Outfitter offer
 * the shared flag counts, `newCapabilityOffers.ts`), ahead of the next +% step: else the cheaper
 * of the drill's two tracks (drill power, drill tip). The price rounds up (ticket 681), so the chip
 * never reads cheaper than the Outfitter's bill. Its title (at most 3 words, out of sight for
 * assistive tech) and its hover line (at most 12: the offer's name and its "Affordable" or
 * "{N} trips away", which a desktop hover or tap reveals, as a dial's number; never a tooltip, so
 * clicks reach the game) come from `chipWordsOf`.
 */
import type { AuthorityState } from '../authority/authorityState'
import { nextUpgradePrice } from '../authority/workshopRules'
import { trackIconIdOf } from '../art/icons/iconSet'
import type { UpgradeId } from '../economy/economyDefinition'
import { cmp, type Money } from '../money'
import { newCapabilityOffersOf } from './newCapabilityOffers'
import { guidanceTextOf, shopGuidanceOf } from './shopGuidance'
import { EMPTY_TRIP_LEDGER, type TripLedger } from './tripIncome'
import type { ElementText } from './uiText'
import { priceReading, type AmountReading } from './viewParts'
import { trackLabelOf } from './workshopRows'

/** What the chip offers: a capability the rig lacks, or the next step of a drill track. */
export type ChipOfferKind = 'capability' | 'track'

export interface NextUpgradeChip {
  kind: ChipOfferKind
  /** The Outfitter card's key: `track.<upgradeId>`, `guns`, `item.<id>` or `entry.<id>`. */
  offerKey: string
  name: string
  iconId: string
  price: AmountReading
  /** "Affordable" or "{N} trips away"; null until a trip is done (`shopGuidance.ts`). */
  guidanceText: string | null
}

export const CHIP_TEXT_ID = 'hud.strip.next-upgrade'

const CHIP_TITLES: Readonly<Record<ChipOfferKind, string>> = {
  capability: 'New gear',
  track: 'Next upgrade',
}

/** The drill's tracks, in the order a tie keeps: the drill first, then its tip. */
const DRILL_TRACKS: readonly UpgradeId[] = ['drill_power', 'drill_tip']

interface ChipOffer {
  kind: ChipOfferKind
  key: string
  name: string
  iconId: string
  price: Money
}

export function nextUpgradeChipOf(
  state: AuthorityState,
  playerId: string,
  tripLedger: TripLedger = EMPTY_TRIP_LEDGER,
): NextUpgradeChip {
  const offer =
    cheapestOf(capabilityOffersOf(state, playerId)) ?? cheapestDrillStepOf(state, playerId)
  const guidance = shopGuidanceOf(state.players[playerId].wallet, tripLedger)
  return {
    kind: offer.kind,
    offerKey: offer.key,
    name: offer.name,
    iconId: offer.iconId,
    price: priceReading(offer.price),
    guidanceText: guidanceTextOf(offer.price, guidance),
  }
}

export interface ChipWords {
  text: ElementText
  /** The offer's name, and its guidance once a trip is done. */
  hoverLine: string
}

export function chipWordsOf(chip: NextUpgradeChip): ChipWords {
  return {
    text: { id: CHIP_TEXT_ID, title: CHIP_TITLES[chip.kind], oneLine: '', tooltipLines: [] },
    hoverLine: chip.guidanceText === null ? chip.name : `${chip.name}: ${chip.guidanceText}`,
  }
}

function capabilityOffersOf(state: AuthorityState, playerId: string): ChipOffer[] {
  return newCapabilityOffersOf(state, playerId).map((offer) => ({ ...offer, kind: 'capability' }))
}

function cheapestDrillStepOf(state: AuthorityState, playerId: string): ChipOffer {
  const steps = DRILL_TRACKS.map((upgradeId) => drillStepOf(state, playerId, upgradeId))
  return steps.reduce((kept, step) => (isCheaper(step, kept) ? step : kept))
}

function drillStepOf(state: AuthorityState, playerId: string, upgradeId: UpgradeId): ChipOffer {
  return {
    kind: 'track',
    key: `track.${upgradeId}`,
    name: trackLabelOf(upgradeId),
    iconId: trackIconIdOf(upgradeId),
    price: nextUpgradePrice(state, playerId, upgradeId),
  }
}

/** The cheapest offer, the first on a tie; null with none. */
function cheapestOf(offers: readonly ChipOffer[]): ChipOffer | null {
  if (offers.length === 0) return null
  return offers.reduce((kept, offer) => (isCheaper(offer, kept) ? offer : kept))
}

function isCheaper(offer: ChipOffer, than: ChipOffer): boolean {
  return cmp(offer.price, than.price) < 0
}
