/**
 * The six upgrade tracks as stats of integer levels (decisions #6 sections 1 and 3, #7):
 *   drillPower  D(L) = 1.5 * 1.12^L       drillTip  P(L) = 1 * 1.2544^L      hullMax 100 * 1.12^L
 *   energyMax   150 + 6L                  cargo     10 + 4L
 *   engine      min + (max - min) * L / (L + 25) for speed 6..14, accel 1.0..1.8, twr 2.0..3.5
 * Level 0 is the 1.0x start of every track. Unbounded stats are BigStat; the bounded ones are
 * plain numbers the physics step may read (#5 rule 5).
 *
 * The per-track functions take a major level `L`, today's curve, which the design tables read. A
 * vehicle stores steps (#180 section 3, `upgradeSteps.ts`): `vehicleStatsAt` and the `...AtStep`
 * functions evaluate each curve at the step's effective level (`stepStats.ts`).
 */
import { fromSafeInteger, mul, type BigStat } from '../money'
import { growGeometric, growLinear, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import { geometricAtStep, linearAtStep, saturatingAtStep } from './stepStats'
import { majorOf, majorsOfSteps, stepOfMajor, type TrackNumbers } from './upgradeSteps'
import {
  UPGRADE_IDS,
  type GeometricEffect,
  type LinearEffect,
  type SaturatingEffect,
  type UpgradeDef,
  type UpgradeId,
} from './economyDefinition'

/** Per track, a level: the stored step on a vehicle, a major level in the design tables. */
export type UpgradeLevels = TrackNumbers

export interface EngineStats {
  /** m/s; always under the 16 m/s tunnelling limit of #7. */
  speedMax: number
  accel: number
  thrustToWeight: number
}

export interface VehicleStats {
  drillPower: BigStat
  drillTip: BigStat
  /**
   * The tip at the last completed major, which every drill gate compares (#180 amendment 2): a
   * gate then opens on a big level-up, never silently on a pip in a held chain.
   */
  gateTip: BigStat
  hullMax: BigStat
  energyMax: number
  cargoCapacity: number
  engine: EngineStats
}

const FIRST_PLANET = 1

/** The upgrade definitions a stat is read from; the game's own come from `economy.json`. */
export type UpgradeDefs = readonly UpgradeDef[]

export function drillPower(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return growGeometricStat(geometricEffectOf(defs, 'drill_power'), level)
}

export function drillTip(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return growGeometricStat(geometricEffectOf(defs, 'drill_tip'), level)
}

export function hullMax(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return growGeometricStat(geometricEffectOf(defs, 'hull'), level)
}

export function energyMax(level: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return growLinearStat(linearEffectOf(defs, 'boiler'), level)
}

export function cargoCapacity(level: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return growLinearStat(linearEffectOf(defs, 'cargo_hold'), level)
}

export function engineStats(level: number, defs: UpgradeDefs = ECONOMY.upgrades): EngineStats {
  const { stats, halfLevel } = saturatingEffectOf(defs, 'engine')
  return {
    speedMax: saturate(stats.speedMax, level, halfLevel),
    accel: saturate(stats.accel, level, halfLevel),
    thrustToWeight: saturate(stats.thrustToWeight, level, halfLevel),
  }
}

/**
 * The stats of a vehicle's stored steps (#7, #180): pure, so a balance change in the definitions
 * retunes every old save, which holds only the integer steps.
 */
export function vehicleStatsAt(
  levels: UpgradeLevels,
  defs: UpgradeDefs = ECONOMY.upgrades,
): VehicleStats {
  return {
    drillPower: drillPowerAtStep(levels.drill_power, defs),
    drillTip: drillTipAtStep(levels.drill_tip, defs),
    gateTip: drillTip(majorOf(levels.drill_tip), defs),
    hullMax: hullMaxAtStep(levels.hull, defs),
    energyMax: energyMaxAtStep(levels.boiler, defs),
    cargoCapacity: cargoCapacityAtStep(levels.cargo_hold, defs),
    engine: engineStatsAtStep(levels.engine, defs),
  }
}

export function drillPowerAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return geometricAtStep(geometricEffectOf(defs, 'drill_power'), step)
}

export function drillTipAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return geometricAtStep(geometricEffectOf(defs, 'drill_tip'), step)
}

export function hullMaxAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return geometricAtStep(geometricEffectOf(defs, 'hull'), step)
}

export function energyMaxAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return linearAtStep(linearEffectOf(defs, 'boiler'), step)
}

export function cargoCapacityAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return linearAtStep(linearEffectOf(defs, 'cargo_hold'), step)
}

export function engineStatsAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): EngineStats {
  const { stats, halfLevel } = saturatingEffectOf(defs, 'engine')
  return {
    speedMax: saturatingAtStep(stats.speedMax, halfLevel, step),
    accel: saturatingAtStep(stats.accel, halfLevel, step),
    thrustToWeight: saturatingAtStep(stats.thrustToWeight, halfLevel, step),
  }
}

/** Energy a rescue tow always leaves: 25% of `energyMax` (#9), so a broke player can still dig. */
export function rescueEnergyFloor(boilerStep: number): BigStat {
  return mul(ECONOMY.energy.rescueFloorFraction, fromSafeInteger(energyMaxAtStep(boilerStep)))
}

/** The level an on-curve player holds at the end of planet `p` (#6 section 3). */
export function onCurveLevel(upgradeId: UpgradeId, planetIndex: number): number {
  const { levelAtPlanet1, levelsPerPlanet } = upgradeDefOf(ECONOMY.upgrades, upgradeId).onCurve
  return levelAtPlanet1 + levelsPerPlanet * (planetIndex - FIRST_PLANET)
}

export function onCurveLevels(planetIndex: number): UpgradeLevels {
  return levelsOf((upgradeId) => onCurveLevel(upgradeId, planetIndex))
}

/** The steps an on-curve player holds at the end of planet `p`: its majors, no pip. */
export function onCurveSteps(planetIndex: number): UpgradeLevels {
  return levelsOf((upgradeId) => stepOfMajor(onCurveLevel(upgradeId, planetIndex)))
}

export function startLevels(): UpgradeLevels {
  return levelsOf(() => 0)
}

/** `S`, the sum of the six major levels that picks the vehicle's look (#7; majors since #180). */
export function totalUpgradeLevel(levels: UpgradeLevels): number {
  const majors = majorsOfSteps(levels)
  return UPGRADE_IDS.reduce((total, upgradeId) => total + majors[upgradeId], 0)
}

/** `1 + [S >= T2] + [S >= T3]` with T2 = 8 and T3 = 20 (#20 Systems & Economy addition 1). */
export function visualTier(levels: UpgradeLevels): number {
  const total = totalUpgradeLevel(levels)
  const reached = ECONOMY.visualTiers.filter((threshold) => total >= threshold.minTotalLevel)
  return Math.max(...reached.map((threshold) => threshold.tier))
}

/**
 * The brass gauge under the Upgrade bay preview (#44): the levels owned since the current visual
 * tier and the levels that tier spans to the next; `span` is null at the last tier, which has no
 * next shape.
 */
export interface VisualTierGauge {
  owned: number
  span: number | null
}

export function visualTierGaugeOf(levels: UpgradeLevels): VisualTierGauge {
  const total = totalUpgradeLevel(levels)
  const tier = visualTier(levels)
  const from = ECONOMY.visualTiers.find((threshold) => threshold.tier === tier)?.minTotalLevel ?? 0
  const next = ECONOMY.visualTiers.find((threshold) => threshold.tier === tier + 1)
  return { owned: total - from, span: next === undefined ? null : next.minTotalLevel - from }
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

function upgradeDefOf(defs: UpgradeDefs, upgradeId: UpgradeId): UpgradeDef {
  const upgrade = defs.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId} in the definitions`)
  return upgrade
}

function geometricEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): GeometricEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'geometric') throw new RangeError(`${upgradeId} is not geometric`)
  return effect
}

function linearEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): LinearEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'linear') throw new RangeError(`${upgradeId} is not linear`)
  return effect
}

function saturatingEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): SaturatingEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'saturating') throw new RangeError(`${upgradeId} is not saturating`)
  return effect
}
