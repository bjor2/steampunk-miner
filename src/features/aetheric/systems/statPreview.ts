/**
 * `statPreview(entryId, mark, planetIndex)` (spec #162 "Slice and contract"): what the resonance
 * whistle does at a Mark, as raw values the item card formats (#159), and its one-off price (#162
 * 4.1), fixed at the unlock planet so a card shows one number. The cooldown, the lure's duration
 * and the charges step with the Marks; the reach and the energy a blow costs stay as bought.
 * Times read in seconds, energy in units of the tank.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { markStepOf } from '../../tech-tree'
import { WHISTLE_ID, whistleBalance, whistleMarkLadder, whistlePrice } from './whistleItem'

export interface StatPreviewLine {
  label: string
  value: Money
  /** A stat the Marks step, so the card shows the next Mark's value beside it. */
  isMarked: boolean
}

/** The whistle's lines at `mark`, its price last; none for an id this lane does not own. */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): readonly StatPreviewLine[] {
  if (entryId !== WHISTLE_ID) return []
  return [...markedLinesOf(mark), ...boughtLines(), priceLine()]
}

function markedLinesOf(mark: number): StatPreviewLine[] {
  const balance = whistleBalance()
  const stats = markStepOf(whistleMarkLadder(), mark).stats
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Lure lasts (s)', secondsOf(stats.magnitude ?? balance.durationTicks)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
  ]
}

function boughtLines(): StatPreviewLine[] {
  const balance = whistleBalance()
  return [
    bought('Reach (tiles)', fromSafeInteger(balance.reachTiles)),
    bought('Energy a blow', unitsOf(balance.energyQuanta)),
  ]
}

function priceLine(): StatPreviewLine {
  return bought('Price', whistlePrice())
}

function marked(label: string, value: Money): StatPreviewLine {
  return { label, value, isMarked: true }
}

function bought(label: string, value: Money): StatPreviewLine {
  return { label, value, isMarked: false }
}

function secondsOf(ticks: number): Money {
  return div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_SECOND))
}

function unitsOf(quanta: number): Money {
  return div(fromSafeInteger(quanta), fromSafeInteger(ENERGY_QUANTA_PER_UNIT))
}
