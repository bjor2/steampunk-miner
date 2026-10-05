/**
 * The six upgrade tracks as stats of integer levels (decisions #6 sections 1 and 3, #7):
 *   drillPower  D(L) = 1.5 * 1.12^L       drillTip  P(L) = 1 * 1.2544^L      hullMax 100 * 1.12^L
 *   energyMax   150 + 6L                  cargo     10 + 4L
 *   engine      min + (max - min) * L / (L + 25) for speed 6..14, accel 1.0..1.8, twr 2.0..3.5
 * Level 0 is the 1.0x start of every track. Unbounded stats are BigStat; the bounded ones are
 * plain numbers the physics step may read (#5 rule 5).
 */
import type { BigStat } from '../money'
import { growGeometric, growLinear, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import {
  UPGRADE_IDS,
  type GeometricEffect,
  type LinearEffect,
  type SaturatingEffect,
  type UpgradeDef,
  type UpgradeId,
} from './economyDefinition'

export type UpgradeLevels = Readonly<Record<UpgradeId, number>>

export interface EngineStats {
  /** m/s; always under the 16 m/s tunnelling limit of #7. */
  speedMax: number
  accel: number
  thrustToWeight: number
}

export interface VehicleStats {
  drillPower: BigStat
  drillTip: BigStat
  hullMax: BigStat
  energyMax: number
  cargoCapacity: number
  engine: EngineStats
}

const FIRST_PLANET = 1

export function drillPower(level: number): BigStat {
  return growGeometricStat(geometricEffectOf('drill_power'), level)
}

export function drillTip(level: number): BigStat {
  return growGeometricStat(geometricEffectOf('drill_tip'), level)
}

export function hullMax(level: number): BigStat {
  return growGeometricStat(geometricEffectOf('hull'), level)
}

export function energyMax(level: number): number {
  return growLinearStat(linearEffectOf('boiler'), level)
}

export function cargoCapacity(level: number): number {
  return growLinearStat(linearEffectOf('cargo_hold'), level)
}

export function engineStats(level: number): EngineStats {
  const { stats, halfLevel } = saturatingEffectOf('engine')
  return {
    speedMax: saturate(stats.speedMax, level, halfLevel),
    accel: saturate(stats.accel, level, halfLevel),
    thrustToWeight: saturate(stats.thrustToWeight, level, halfLevel),
  }
}

/** `computeVehicleStats(levels)` of #7: pure, so a balance change retunes every old save. */
export function computeVehicleStats(levels: UpgradeLevels): VehicleStats {
  return {
    drillPower: drillPower(levels.drill_power),
    drillTip: drillTip(levels.drill_tip),
    hullMax: hullMax(levels.hull),
    energyMax: energyMax(levels.boiler),
    cargoCapacity: cargoCapacity(levels.cargo_hold),
    engine: engineStats(levels.engine),
  }
}

/** The level an on-curve player holds at the end of planet `p` (#6 section 3). */
export function onCurveLevel(upgradeId: UpgradeId, planetIndex: number): number {
  const { levelAtPlanet1, levelsPerPlanet } = upgradeDefOf(upgradeId).onCurve
  return levelAtPlanet1 + levelsPerPlanet * (planetIndex - FIRST_PLANET)
}

export function onCurveLevels(planetIndex: number): UpgradeLevels {
  return levelsOf((upgradeId) => onCurveLevel(upgradeId, planetIndex))
}

export function startLevels(): UpgradeLevels {
  return levelsOf(() => 0)
}

/** `S`, the sum of the six levels that picks the vehicle's look (#7). */
export function totalUpgradeLevel(levels: UpgradeLevels): number {
  return UPGRADE_IDS.reduce((total, upgradeId) => total + levels[upgradeId], 0)
}

/** `1 + [S >= T2] + [S >= T3]` with T2 = 8 and T3 = 20 (#20 Systems & Economy addition 1). */
export function visualTier(levels: UpgradeLevels): number {
  const total = totalUpgradeLevel(levels)
  const reached = ECONOMY.visualTiers.filter((threshold) => total >= threshold.minTotalLevel)
  return Math.max(...reached.map((threshold) => threshold.tier))
}

function levelsOf(levelFor: (upgradeId: UpgradeId) => number): UpgradeLevels {
  const entries = UPGRADE_IDS.map((upgradeId) => [upgradeId, levelFor(upgradeId)] as const)
  return Object.fromEntries(entries) as Record<UpgradeId, number>
}

function growGeometricStat(effect: GeometricEffect, level: number): BigStat {
  return growGeometric(effect.start, effect.ratio, level)
}

function growLinearStat(effect: LinearEffect, level: number): number {
  return growLinear(effect.start, effect.step, level)
}

function upgradeDefOf(upgradeId: UpgradeId): UpgradeDef {
  const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId} in economy.json`)
  return upgrade
}

function geometricEffectOf(upgradeId: UpgradeId): GeometricEffect {
  const { effect } = upgradeDefOf(upgradeId)
  if (effect.family !== 'geometric') throw new RangeError(`${upgradeId} is not geometric`)
  return effect
}

function linearEffectOf(upgradeId: UpgradeId): LinearEffect {
  const { effect } = upgradeDefOf(upgradeId)
  if (effect.family !== 'linear') throw new RangeError(`${upgradeId} is not linear`)
  return effect
}

function saturatingEffectOf(upgradeId: UpgradeId): SaturatingEffect {
  const { effect } = upgradeDefOf(upgradeId)
  if (effect.family !== 'saturating') throw new RangeError(`${upgradeId} is not saturating`)
  return effect
}
