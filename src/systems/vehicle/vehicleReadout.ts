/**
 * Display text for the vehicle's gauges. Display only (#5 rule 6): energy shows whole units of
 * the 1/240 quanta (#33: "112 / 150"), hull and cargo as counts; nothing here feeds back.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { formatAmount } from '../displayAmount'
import { roundToWhole, type BigStat } from '../money'

export function energyGaugeText(quanta: number, maxQuanta: number): string {
  return `${formatAmount(wholeEnergyUnits(quanta))} / ${formatAmount(wholeEnergyUnits(maxQuanta))}`
}

/** Hull is a BigStat with up to 40 digits (`100 * 1.12^L`), so it shows as a whole count. */
export function hullGaugeText(hull: BigStat, hullMax: BigStat): string {
  return `${formatAmount(roundToWhole(hull))} / ${formatAmount(roundToWhole(hullMax))}`
}

export function cargoGaugeText(units: number, capacity: number): string {
  return `${formatAmount(units)} / ${formatAmount(capacity)}`
}

function wholeEnergyUnits(quanta: number): number {
  return Math.floor(quanta / ENERGY_QUANTA_PER_UNIT)
}
