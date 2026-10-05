/**
 * The vehicle stats as plain JSON for the debug API's `vehicleStats()` (#7, #11): BigStats as
 * canonical strings, bounded stats as numbers, plus the on-curve table for planets 1 to 40 that
 * #14 asks for (`onCurveLevel`, #6 section 3).
 */
import { vehicleStatsTable } from '../economy/economyTables'
import type { EngineStats, UpgradeLevels, VehicleStats } from '../economy/vehicleStats'
import { toCanonical } from '../money'

export interface VehicleStatsView {
  drillPower: string
  drillTip: string
  hullMax: string
  energyMax: number
  cargoCapacity: number
  engine: EngineStats
}

export interface OnCurveVehicleView {
  planetIndex: number
  levels: UpgradeLevels
  stats: VehicleStatsView
}

/** The slice's planets plus the 38 after them that the #6 tables already cover. */
const TABLE_PLANETS = 40

export function vehicleStatsViewOf(stats: VehicleStats): VehicleStatsView {
  return {
    drillPower: toCanonical(stats.drillPower),
    drillTip: toCanonical(stats.drillTip),
    hullMax: toCanonical(stats.hullMax),
    energyMax: stats.energyMax,
    cargoCapacity: stats.cargoCapacity,
    engine: { ...stats.engine },
  }
}

export function onCurveVehicleViews(): OnCurveVehicleView[] {
  return vehicleStatsTable(TABLE_PLANETS).map((row) => ({
    planetIndex: row.planetIndex,
    levels: row.levels,
    stats: vehicleStatsViewOf(row.stats),
  }))
}
