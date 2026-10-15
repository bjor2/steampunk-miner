/**
 * The dock panels' shared pieces on the Title+OneLine element (spec #422, pass #427): an element
 * with a title alone, and an amount beside the money glyph, a price holding `price` so the budget
 * test keeps it on the element.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ElementText } from '../../systems/views/uiText'
import type { AmountReading } from '../../systems/views/viewParts'
import type { IconValue } from '../kit/TitleOneLine'

const MONEY_ICON_ID = hudLabelIconIdOf('money')

export function titleOnlyTextOf(id: string, title: string): ElementText {
  return { id, title, oneLine: '', tooltipLines: [] }
}

/** An amount beside the money glyph. */
export function moneyFactOf(reading: AmountReading, testId?: string): IconValue {
  return { iconId: MONEY_ICON_ID, text: reading.text, exact: reading.exact, testId }
}

/** A price or a charge: it holds `price`, so the budget test keeps it off the tooltip. */
export function priceFactOf(reading: AmountReading, testId?: string): IconValue {
  return { ...moneyFactOf(reading, testId), holds: 'price' }
}
