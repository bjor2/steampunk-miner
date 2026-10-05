/**
 * Display text for the vehicle's gauges. Display only (#5 rule 6): energy shows whole units of
 * the 1/240 quanta (#33: "112 / 150"), hull and cargo as counts; nothing here feeds back.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { formatMoney } from '../formatMoney'
import type { Money } from '../money'

export function energyGaugeText(quanta: number, maxQuanta: number): string {
  return `${Math.floor(quanta / ENERGY_QUANTA_PER_UNIT)} / ${maxQuanta / ENERGY_QUANTA_PER_UNIT}`
}

export function hullGaugeText(hull: Money, hullMax: Money): string {
  return `${formatMoney(hull)} / ${formatMoney(hullMax)}`
}

export function cargoGaugeText(units: number, capacity: number): string {
  return `${units} / ${capacity}`
}
