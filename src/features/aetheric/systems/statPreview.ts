/**
 * `statPreview(entryId, mark, planetIndex)` (spec #162 "Slice and contract"): what an aetheric item
 * does at a Mark, as raw values the item card formats (#159), and its one-off price (#162 4.1),
 * fixed at the unlock planet so a card shows one number. The cooldown, the duration and the
 * charges step with the Marks; the rest stays as bought. Times read in seconds, energy in units of
 * the tank, heat in percent of the item heat gauge.
 *
 * - The resonance whistle (#262): its lure's duration, its reach and the energy a blow costs.
 * - The phase lantern (#261): the energy a phase adds to the bit's own and the heat it adds; the
 *   ticks and the bit's energy are the cell's, so the card shows neither.
 * - The galvanic arc coil (#261): the bolt's reach, how many enemies one bolt hits, and the energy
 *   and heat a bolt costs.
 * - The chronometric governor (#263): its pocket's duration and range, the energy it draws a
 *   second and the heat a pocket adds.
 * - The aether condenser (#263): the energy a full item heat gauge condenses into.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { CONDENSE_RATIO } from '../../../systems/aetheric/condense'
import { div, fromSafeInteger, mul, type Money } from '../../../systems/money'
import { markStepOf, type MarkLadder } from '../../tech-tree'
import { ARC_COIL_ID, arcCoilBalance, arcCoilMarkLadder, arcCoilPrice } from './arcCoilItem'
import {
  condenserBalance,
  condenserMarkLadder,
  CONDENSER_ID,
  condenserPrice,
} from './condenserItem'
import { governorBalance, governorMarkLadder, GOVERNOR_ID, governorPrice } from './governorItem'
import { gaugeMaxUnits } from './itemHeat'
import { LANTERN_ID, lanternBalance, lanternMarkLadder, lanternPrice } from './lanternItem'
import { WHISTLE_ID, whistleBalance, whistleMarkLadder, whistlePrice } from './whistleItem'

export interface StatPreviewLine {
  label: string
  value: Money
  /** A stat the Marks step, so the card shows the next Mark's value beside it. */
  isMarked: boolean
}

const PERCENT = 100

const PREVIEWS: Readonly<Record<string, (mark: number) => readonly StatPreviewLine[]>> = {
  [WHISTLE_ID]: whistleLinesOf,
  [LANTERN_ID]: lanternLinesOf,
  [ARC_COIL_ID]: arcCoilLinesOf,
  [GOVERNOR_ID]: governorLinesOf,
  [CONDENSER_ID]: condenserLinesOf,
}

/** The item's lines at `mark`, its price last; none for an id this lane does not own. */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): readonly StatPreviewLine[] {
  return PREVIEWS[entryId]?.(mark) ?? []
}

function whistleLinesOf(mark: number): StatPreviewLine[] {
  const balance = whistleBalance()
  const stats = statsAt(whistleMarkLadder(), mark)
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Lure lasts (s)', secondsOf(stats.magnitude ?? balance.durationTicks)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
    bought('Reach (tiles)', fromSafeInteger(balance.reachTiles)),
    bought('Energy a blow', unitsOf(balance.energyQuanta)),
    bought('Price', whistlePrice()),
  ]
}

function lanternLinesOf(mark: number): StatPreviewLine[] {
  const balance = lanternBalance()
  const stats = statsAt(lanternMarkLadder(), mark)
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
    bought('Extra energy a phase', unitsOf(balance.energyQuanta)),
    bought('Heat a phase (%)', gaugePercentOf(balance.heatUnits)),
    bought('Price', lanternPrice()),
  ]
}

function arcCoilLinesOf(mark: number): StatPreviewLine[] {
  const balance = arcCoilBalance()
  const stats = statsAt(arcCoilMarkLadder(), mark)
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Reach (tiles)', fromSafeInteger(stats.magnitude ?? balance.rangeTiles)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
    bought('Enemies a bolt', fromSafeInteger(balance.chainCount + 1)),
    bought('Energy a bolt', unitsOf(balance.energyQuanta)),
    bought('Heat a bolt (%)', gaugePercentOf(balance.heatUnits)),
    bought('Price', arcCoilPrice()),
  ]
}

function governorLinesOf(mark: number): StatPreviewLine[] {
  const balance = governorBalance()
  const stats = statsAt(governorMarkLadder(), mark)
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Pocket lasts (s)', secondsOf(stats.magnitude ?? balance.durationTicks)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
    bought('Range (tiles)', fromSafeInteger(balance.rangeTiles)),
    bought('Energy a second', unitsOf(balance.energyQuantaPerTick * TICKS_PER_SECOND)),
    bought('Heat a pocket (%)', gaugePercentOf(balance.heatUnits)),
    bought('Price', governorPrice()),
  ]
}

function condenserLinesOf(mark: number): StatPreviewLine[] {
  const balance = condenserBalance()
  const stats = statsAt(condenserMarkLadder(), mark)
  return [
    marked('Cooldown (s)', secondsOf(stats.cooldown ?? balance.cooldownTicks)),
    marked('Charges', fromSafeInteger(stats.charges ?? balance.charges)),
    bought('Energy a full gauge', unitsOf(Math.floor(gaugeMaxUnits() / CONDENSE_RATIO))),
    bought('Price', condenserPrice()),
  ]
}

function statsAt(ladder: MarkLadder, mark: number) {
  return markStepOf(ladder, mark).stats
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

function gaugePercentOf(units: number): Money {
  return div(
    mul(fromSafeInteger(units), fromSafeInteger(PERCENT)),
    fromSafeInteger(gaugeMaxUnits()),
  )
}
