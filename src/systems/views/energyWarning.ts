/**
 * The low-energy warning that cannot lie about the way home (#33 section 5). Display only, never
 * authority state:
 *
 *   returnReserve = ceil(depthTiles * 1.5 / speedMax)            units (systems/vehicle/returnReserve)
 *   critical : energy <= max(returnReserve,                  10% of energyMax)
 *   low      : energy <= max(returnReserveMargin * returnReserve, 25% of energyMax)
 *
 * The 25% and 10% lines are the `energy_low` thresholds of #7 (`ENERGY_LOW_PERCENTS`), which this
 * does not change. `returnReserveMargin` (2) is the tunable in `src/data/hud/hud.json`, room for a
 * crooked tunnel and a stop-and-go climb, to be checked in the feel test. Compared in quanta, so
 * the levels are exact.
 */
import HUD_TUNING from '../../data/hud/hud.json'
import { ENERGY_LOW_PERCENTS, ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { isAtOrBelowPercent } from '../vehicle/energyQuanta'
import { returnReserveUnits } from '../vehicle/returnReserve'

export type EnergyWarningLevel = 'ok' | 'low' | 'critical'

export interface EnergyReading {
  energyQuanta: number
  energyMaxQuanta: number
  depthTiles: number
  speedMax: number
}

const LOW_PERCENT = Math.max(...ENERGY_LOW_PERCENTS)
const CRITICAL_PERCENT = Math.min(...ENERGY_LOW_PERCENTS)

export const RETURN_RESERVE_MARGIN: number = HUD_TUNING.returnReserveMargin

export function energyWarningLevel(reading: EnergyReading): EnergyWarningLevel {
  const reserveQuanta =
    returnReserveUnits(reading.depthTiles, reading.speedMax) * ENERGY_QUANTA_PER_UNIT
  if (isAtOrBelow(reading, reserveQuanta, CRITICAL_PERCENT)) return 'critical'
  if (isAtOrBelow(reading, RETURN_RESERVE_MARGIN * reserveQuanta, LOW_PERCENT)) return 'low'
  return 'ok'
}

function isAtOrBelow(reading: EnergyReading, reserveQuanta: number, percent: number): boolean {
  return (
    reading.energyQuanta <= reserveQuanta ||
    isAtOrBelowPercent(reading.energyQuanta, reading.energyMaxQuanta, percent)
  )
}
