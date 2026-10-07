/**
 * The item card's lines for one Mark of a drill-gear item (#159, #164): `statPreview`'s raw values
 * in the units a player reads, each label naming its unit the way the mobility lane's do (ticks as
 * seconds, basis points as percent), and the one-off price last. Every shipped item has a price,
 * so even a part with no numbers yet (the thaw crown) has a line (#164 coverage rule).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { TrackKind } from '../../../systems/economy/trackKind'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import {
  drillGearItemOf,
  itemPriceOf,
  type DrillGearItem,
  type DrillGearStatUnit,
} from './drillGearItems'
import { statPreview, type DrillGearStatLine } from './statPreview'

export interface CardLine {
  label: string
  /** Stats grow a whole step a Mark; the price is money, priced on the band-ore curve. */
  kind: Extract<TrackKind, 'linearInt' | 'geometric'>
  value: Money
  /** A line the Mark rotation steps: its next value is the next Mark's. */
  isMarkStepped: boolean
}

const PERCENT_OF_BASIS_POINTS = 100

/** What each unit adds to the label, and how its raw value reads. */
const UNIT_READINGS: Readonly<Record<DrillGearStatUnit, { suffix: string; divisor: number }>> = {
  charges: { suffix: '', divisor: 1 },
  ticks: { suffix: ' (s)', divisor: TICKS_PER_SECOND },
  tiles: { suffix: ' (tiles)', divisor: 1 },
  cells: { suffix: ' (cells)', divisor: 1 },
  m: { suffix: ' (m)', divisor: 1 },
  bp: { suffix: ' (%)', divisor: PERCENT_OF_BASIS_POINTS },
  bp_per_second: { suffix: ' (% of tank a second)', divisor: PERCENT_OF_BASIS_POINTS },
}

/** One-off items read the same on every planet (#162 4.1), so the card asks for any one. */
const ANY_PLANET = 1

/** The card's lines at `mark`, price last; none for an id this lane does not sell. */
export function cardLinesOf(itemId: string, mark: number): readonly CardLine[] {
  const item = drillGearItemOf(itemId)
  const preview = statPreview(itemId, mark, ANY_PLANET)
  if (item === null || preview === null) return []
  return [...preview.lines.map((line) => cardLineOf(item, line)), priceLineOf(item)]
}

function cardLineOf(item: DrillGearItem, line: DrillGearStatLine): CardLine {
  const reading = UNIT_READINGS[line.unit]
  return {
    label: `${line.label}${reading.suffix}`,
    kind: 'linearInt',
    value: div(fromSafeInteger(line.value), fromSafeInteger(reading.divisor)),
    isMarkStepped: isMarkStepped(item, line),
  }
}

function isMarkStepped(item: DrillGearItem, line: DrillGearStatLine): boolean {
  const stat = item.stats.find((candidate) => candidate.stat === line.stat)
  return stat?.markRole !== undefined
}

/** A previewed item is never held back, so it always has a price. */
function priceLineOf(item: DrillGearItem): CardLine {
  return {
    label: 'Price',
    kind: 'geometric',
    value: itemPriceOf(item) as Money,
    isMarkStepped: false,
  }
}
