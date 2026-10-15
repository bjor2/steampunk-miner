/**
 * The footer's travel fee and fragments as glyph-and-value facts on their #33 ids (spec #422,
 * pass #425): the fee is a price, so it never leaves the element; none on the last planet.
 */
import { CORE_FRAGMENT_ICON_ID, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { TravelReading } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import type { IconValue } from '../kit/TitleOneLine'

export function travelFactsOf(travel: TravelReading | null): IconValue[] {
  if (travel === null) return []
  const fee: IconValue = {
    iconId: hudLabelIconIdOf('money'),
    text: travel.fee.text,
    exact: travel.fee.exact,
    holds: 'price',
    testId: UI_IDS.platformTravelFee,
  }
  const fragments: IconValue = {
    iconId: CORE_FRAGMENT_ICON_ID,
    text: travel.fragmentsText,
    testId: UI_IDS.platformTravelFragments,
  }
  return [fee, fragments]
}
