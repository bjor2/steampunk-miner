/**
 * Per-planet views of the economy formulas (decision #6 tables A to D, ids `economy.planetTable`
 * and `economy.enemyStatsTable`; #7 `vehicleStats()` per planet; #14 per-planet tracking). Every
 * row is computed from the formulas, never stored, so the views hold for any planet index.
 */
import type { BigStat, Money } from '../money'
import { BAND_COUNT } from '../world/planetGeometry'
import { coreRadiusFor, radiusForPlanet } from '../world/planetParams'
import { discTileCount } from '../world/tileGrid'
import type { EnemyKind } from './economyDefinition'
import {
  enemyBaseHit,
  enemyHealth,
  enemyTier,
  pinnedKillSeconds,
  sideHitShareOfHull,
} from './enemyStats'
import { blockHardness, coreHardness, coreMaterialTier, oreTier, oreValue } from './oreEconomy'
import { energyUnitPrice, repairPrice, rescueFeeBounds, travelFee } from './planetCharges'
import { coreFragmentsNeeded } from './planetEconomy'
import { upgradePrice } from './upgradePrices'
import { stepsOfMajors } from './upgradeSteps'
import {
  vehicleStatsAt,
  hullMax,
  onCurveLevel,
  onCurveLevels,
  type UpgradeLevels,
  type VehicleStats,
} from './vehicleStats'

const FIRST_PLANET = 1
const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index + 1)

/** Table A: world and ore. Per-band arrays hold bands 1 to 5. */
export interface PlanetEconomyRow {
  planetIndex: number
  radiusTiles: number
  coreRadiusTiles: number
  coreTileCount: number
  coreFragmentsNeeded: number
  oreValueByBand: readonly Money[]
  coreMaterialValue: Money
  hardnessByBand: readonly BigStat[]
  coreHardness: BigStat
}

/** Table B: an on-curve vehicle at the end of the planet. */
export interface OnCurveVehicleRow {
  planetIndex: number
  levels: UpgradeLevels
  stats: VehicleStats
}

/** Table C: the next level's price at the on-curve level, and the platform's charges. */
export interface PlanetPriceRow {
  planetIndex: number
  drillPowerNext: Money
  drillTipNext: Money
  hullNext: Money
  energyUnitPrice: Money
  fullRepair: Money
  rescueFeeFloor: Money
  rescueFeeCap: Money
  travelFee: Money
}

/** Table D: one enemy kind against on-curve and one-planet-behind players, bands 1 to 5. */
export interface EnemyStatsRow {
  planetIndex: number
  tierByBand: readonly number[]
  healthByBand: readonly BigStat[]
  baseHitByBand: readonly BigStat[]
  killSecondsByBand: readonly BigStat[]
  sideHitShareByBand: readonly BigStat[]
  /** Empty on planet 1, which has no planet behind it. */
  behindKillSecondsByBand: readonly BigStat[]
  behindSideHitShareByBand: readonly BigStat[]
}

export function planetEconomyTable(planetCount: number): PlanetEconomyRow[] {
  return planetsUpTo(planetCount).map(planetEconomyRow)
}

export function vehicleStatsTable(planetCount: number): OnCurveVehicleRow[] {
  return planetsUpTo(planetCount).map(onCurveVehicleRow)
}

export function planetPriceTable(planetCount: number): PlanetPriceRow[] {
  return planetsUpTo(planetCount).map(planetPriceRow)
}

export function enemyStatsTable(kind: EnemyKind, planetCount: number): EnemyStatsRow[] {
  return planetsUpTo(planetCount).map((planetIndex) => enemyStatsRow(kind, planetIndex))
}

export function planetEconomyRow(planetIndex: number): PlanetEconomyRow {
  const radiusTiles = radiusForPlanet(planetIndex)
  const coreRadiusTiles = coreRadiusFor(radiusTiles)
  const coreTileCount = discTileCount(coreRadiusTiles)
  return {
    planetIndex,
    radiusTiles,
    coreRadiusTiles,
    coreTileCount,
    coreFragmentsNeeded: coreFragmentsNeeded(coreTileCount),
    oreValueByBand: BANDS.map((band) => oreValue(oreTier(planetIndex, band))),
    coreMaterialValue: oreValue(coreMaterialTier(planetIndex)),
    hardnessByBand: BANDS.map((band) => blockHardness(planetIndex, band)),
    coreHardness: coreHardness(planetIndex),
  }
}

export function onCurveVehicleRow(planetIndex: number): OnCurveVehicleRow {
  const levels = onCurveLevels(planetIndex)
  return { planetIndex, levels, stats: vehicleStatsAt(stepsOfMajors(levels)) }
}

export function planetPriceRow(planetIndex: number): PlanetPriceRow {
  const fullHull = hullMax(onCurveLevel('hull', planetIndex))
  const rescueBounds = rescueFeeBounds(planetIndex)
  return {
    planetIndex,
    drillPowerNext: nextOnCurvePrice('drill_power', planetIndex),
    drillTipNext: nextOnCurvePrice('drill_tip', planetIndex),
    hullNext: nextOnCurvePrice('hull', planetIndex),
    energyUnitPrice: energyUnitPrice(planetIndex),
    fullRepair: repairPrice(planetIndex, fullHull, fullHull),
    rescueFeeFloor: rescueBounds.floor,
    rescueFeeCap: rescueBounds.cap,
    travelFee: travelFee(planetIndex),
  }
}

export function enemyStatsRow(kind: EnemyKind, planetIndex: number): EnemyStatsRow {
  const tierByBand = BANDS.map((band) => enemyTier(planetIndex, band))
  const behind = planetIndex > FIRST_PLANET ? [planetIndex - 1] : []
  return {
    planetIndex,
    tierByBand,
    healthByBand: tierByBand.map((tier) => enemyHealth(kind, tier)),
    baseHitByBand: tierByBand.map((tier) => enemyBaseHit(kind, tier)),
    killSecondsByBand: killSecondsAt(kind, tierByBand, planetIndex),
    sideHitShareByBand: sideHitSharesAt(kind, tierByBand, planetIndex),
    behindKillSecondsByBand: behind.flatMap((levelPlanet) =>
      killSecondsAt(kind, tierByBand, levelPlanet),
    ),
    behindSideHitShareByBand: behind.flatMap((levelPlanet) =>
      sideHitSharesAt(kind, tierByBand, levelPlanet),
    ),
  }
}

/** Kill times against a player holding the on-curve drill of `levelPlanet`. */
function killSecondsAt(kind: EnemyKind, tiers: readonly number[], levelPlanet: number): BigStat[] {
  const drillLevel = onCurveLevel('drill_power', levelPlanet)
  return tiers.map((tier) => pinnedKillSeconds(kind, tier, drillLevel))
}

function sideHitSharesAt(
  kind: EnemyKind,
  tiers: readonly number[],
  levelPlanet: number,
): BigStat[] {
  const hullLevel = onCurveLevel('hull', levelPlanet)
  return tiers.map((tier) => sideHitShareOfHull(kind, tier, hullLevel))
}

function nextOnCurvePrice(
  upgradeId: 'drill_power' | 'drill_tip' | 'hull',
  planetIndex: number,
): Money {
  return upgradePrice(upgradeId, onCurveLevel(upgradeId, planetIndex), planetIndex)
}

function planetsUpTo(planetCount: number): number[] {
  return Array.from({ length: planetCount }, (_, index) => index + FIRST_PLANET)
}
