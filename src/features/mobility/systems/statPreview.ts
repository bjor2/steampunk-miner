/**
 * `statPreview(entryId, mark, planetIndex)` (spec #162 "Slice and contract"): what a mobility item
 * does at a Mark, as raw values the item card formats (#159), and its price on a planet (#162
 * 4.1). One-off items cost 15 band-5 units at their unlock planet, fixed in the catalogue so a card
 * shows one number; a consumable unit costs 2 band-5 units on the planet it is bought on.
 *
 * Times read in seconds, the rivet patch's plate and a toggle's draw as percents.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { bandOrePrice, bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { markStepOf, type MarkLadder, type MarkStats } from '../../tech-tree'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { mobilityRowOf, type MobilityRow } from './mobilityCatalogue'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { markLadderOf } from './markLadders'

export interface StatPreviewLine {
  label: string
  value: Money
}

type Unit = 'ticks' | 'tiles' | 'basisPoints'

interface MagnitudeLine {
  label: string
  unit: Unit
}

const MAGNITUDE_LINES: Readonly<Record<MobilityItemId, MagnitudeLine | null>> = {
  [MOBILITY_ITEM.grappleWinch]: { label: 'Reach (tiles)', unit: 'tiles' },
  [MOBILITY_ITEM.emergencyBallast]: { label: 'Lighter for (s)', unit: 'ticks' },
  [MOBILITY_ITEM.heatSinkFlask]: { label: 'Heat paused for (s)', unit: 'ticks' },
  [MOBILITY_ITEM.steamBoost]: { label: 'Burst (s)', unit: 'ticks' },
  [MOBILITY_ITEM.rivetPatch]: { label: 'Hull plated (% of max)', unit: 'basisPoints' },
  [MOBILITY_ITEM.steamShield]: { label: 'Curtain (s)', unit: 'ticks' },
  [MOBILITY_ITEM.smokeCanister]: { label: 'Cloud lasts (s)', unit: 'ticks' },
  [MOBILITY_ITEM.gravAnchor]: null,
  [MOBILITY_ITEM.buoyancyTanks]: null,
  [MOBILITY_ITEM.escapeThruster]: { label: 'Burst (s)', unit: 'ticks' },
}

const PERCENT_OF_BASIS_POINTS = 100
const PERCENT_OF_PER_MILLE = 10
const CONSUMABLE = /^consumable\./

/** The item's lines at `mark`, its price last; none for an id this lane does not own. */
export function statPreview(
  entryId: string,
  mark: number,
  planetIndex: number,
): readonly StatPreviewLine[] {
  const row = mobilityRowOf(entryId)
  const ladder = markLadderOf(entryId)
  if (row === null || ladder === null) return []
  return [...markLinesOf(entryId, ladder, mark), priceLineOf(row, planetIndex)]
}

/**
 * The price the store reads (after #165's buy path): fixed at the unlock planet, or per unit on
 * the planet it is bought on; null for an id this lane does not sell.
 */
export function mobilityItemPriceOf(itemId: string, planetIndex: number): Money | null {
  const row = mobilityRowOf(itemId)
  return row === null || markLadderOf(itemId) === null ? null : priceOfRow(row, planetIndex)
}

function priceOfRow(row: MobilityRow, planetIndex: number): Money {
  const { oneOff, consumableUnit } = MOBILITY_ECONOMY.prices
  if (CONSUMABLE.test(row.itemId)) return bandOrePrice(consumableUnit, planetIndex)
  return bandOrePriceAt(oneOff, row.unlockTier, row.unlockTier)
}

function markLinesOf(itemId: string, ladder: MarkLadder, mark: number): StatPreviewLine[] {
  const stats = markStepOf(ladder, mark).stats
  return [
    ...cooldownLineOf(ladder, stats),
    ...magnitudeLineOf(itemId, stats),
    ...chargesLineOf(ladder, stats),
  ]
}

/** A charged item's cooldown; a toggle carries its energy draw there (#162 4.6). */
function cooldownLineOf(ladder: MarkLadder, stats: MarkStats): StatPreviewLine[] {
  if (stats.cooldown === undefined) return []
  if (ladder.charges === undefined) {
    return [{ label: 'Energy draw (% of tank a second)', value: percentOfPerMille(stats.cooldown) }]
  }
  return [{ label: 'Cooldown (s)', value: secondsOf(stats.cooldown) }]
}

function magnitudeLineOf(itemId: string, stats: MarkStats): StatPreviewLine[] {
  const line = MAGNITUDE_LINES[itemId as MobilityItemId]
  if (line === null || stats.magnitude === undefined) return []
  return [{ label: line.label, value: valueInUnit(stats.magnitude, line.unit) }]
}

function chargesLineOf(ladder: MarkLadder, stats: MarkStats): StatPreviewLine[] {
  if (stats.charges === undefined) return []
  const label = ladder.cooldown === undefined ? 'Stack' : 'Charges'
  return [{ label, value: fromSafeInteger(stats.charges) }]
}

function priceLineOf(row: MobilityRow, planetIndex: number): StatPreviewLine {
  const label = CONSUMABLE.test(row.itemId) ? 'Price per unit' : 'Price'
  return { label, value: priceOfRow(row, planetIndex) }
}

function valueInUnit(amount: number, unit: Unit): Money {
  if (unit === 'ticks') return secondsOf(amount)
  if (unit === 'basisPoints')
    return div(fromSafeInteger(amount), fromSafeInteger(PERCENT_OF_BASIS_POINTS))
  return fromSafeInteger(amount)
}

function secondsOf(ticks: number): Money {
  return div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_SECOND))
}

function percentOfPerMille(perMille: number): Money {
  return div(fromSafeInteger(perMille), fromSafeInteger(PERCENT_OF_PER_MILLE))
}
