/**
 * A save slot's summary as glyph-plus-value facts (ticket 703), the same on the title menu's Load
 * list and the pause menu's Save page: the planet's name, the deepest depth with its mini core
 * gauge, and the money, whose exact amount a tap shows when the short text hides digits. A value
 * the header does not hold reads unknown, with no gauge.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type {
  SlotDepthReading,
  SlotReading,
  SlotSummaryLine,
} from '../../systems/views/slotSummaryLine'
import type { IconValue } from '../kit/TitleOneLine'

export function slotSummaryFactsOf(line: SlotSummaryLine): IconValue[] {
  return [
    { iconId: hudLabelIconIdOf('planet'), text: line.planetText },
    depthFactOf(line.depth),
    moneyFactOf(line.money),
  ]
}

function depthFactOf(depth: SlotDepthReading): IconValue {
  const fact = { iconId: hudLabelIconIdOf('depth'), text: depth.text }
  return depth.gaugePermille === null ? fact : { ...fact, gaugePermille: depth.gaugePermille }
}

function moneyFactOf(money: SlotReading): IconValue {
  const fact = { iconId: hudLabelIconIdOf('money'), text: money.text }
  return money.exact === '' ? fact : { ...fact, exact: money.exact }
}
