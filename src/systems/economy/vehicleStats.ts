/**
 * The six upgrade tracks as stats of integer levels (decisions #6 sections 1 and 3, #7):
 *   drillPower  D(n) = 1.5 * 1.12^(1/18) * 1.243^(n-1), D(0) = 1.5, n purchases (#551, 552)
 *   drillTip    P(L) = 1 * 1.2544^L       hullMax 100 * 1.12^L
 *   energyMax   round(150 * 1.10^b)       cargo     round(10 * 1.10^c), b and c purchases (553)
 *   engine      speedMax 6 * 1.05^e m/s, accel 1.0 * 1.05^e, twr 1 + 1.05^e, e purchases (553)
 * Level 0 is the 1.0x start of every track. Unbounded stats are BigStat; the tank, the hold and
 * the engine are plain numbers the physics step, the energy quanta and the cargo counts read (#5
 * rule 5), so they throw past the safe integers rather than round (`stepStats.ts`).
 *
 * The per-track functions take a track's level, which the design tables read: a major `L`, or the
 * purchase count of a per-purchase track (drill power, GD ruling on #551, ticket 552; the boiler,
 * the hold and the engine, Systems' rows on #553, ticket 553), whose level is its stored step. A vehicle
 * stores steps (#180 section 3, `upgradeSteps.ts`): `vehicleStatsAt` and the `...AtStep` functions
 * evaluate each curve at the step's effective level (`stepStats.ts`).
 */
import { fromSafeInteger, mul, type BigStat } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import {
  enginePerPurchaseAtStep,
  geometricAtStep,
  perPurchaseAtStep,
  wholePerPurchaseAtStep,
} from './stepStats'
import { majorOf, majorsOfSteps, stepOfLevel, type TrackNumbers } from './upgradeSteps'
import {
  UPGRADE_IDS,
  type EnginePerPurchaseEffect,
  type GeometricEffect,
  type PerPurchaseEffect,
  type UpgradeDef,
  type UpgradeId,
  type WholePerPurchaseEffect,
} from './economyDefinition'

/** Per track, a level: the stored step on a vehicle, a major level in the design tables. */
export type UpgradeLevels = TrackNumbers

export interface EngineStats {
  /** m/s; with no max level (ticket 553) the stats' step bound follows it (`stepBound.ts`). */
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

/** Drill power after `level` purchases: drill power's level is its stored step (#552). */
export function drillPower(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return drillPowerAtStep(level, defs)
}

export function drillTip(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return growGeometricStat(geometricEffectOf(defs, 'drill_tip'), level)
}

export function hullMax(level: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return growGeometricStat(geometricEffectOf(defs, 'hull'), level)
}

/** The tank after `level` purchases: its level is its stored step (ticket 553). */
export function energyMax(level: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return energyMaxAtStep(level, defs)
}

/** The hold after `level` purchases: its level is its stored step (ticket 553). */
export function cargoCapacity(level: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return cargoCapacityAtStep(level, defs)
}

/** The engine after `level` purchases: its level is its stored step (ticket 553). */
export function engineStats(level: number, defs: UpgradeDefs = ECONOMY.upgrades): EngineStats {
  return engineStatsAtStep(level, defs)
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
  return perPurchaseAtStep(perPurchaseEffectOf(defs, 'drill_power'), step)
}

export function drillTipAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return geometricAtStep(geometricEffectOf(defs, 'drill_tip'), step)
}

export function hullMaxAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): BigStat {
  return geometricAtStep(geometricEffectOf(defs, 'hull'), step)
}

export function energyMaxAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return wholePerPurchaseAtStep(wholePerPurchaseEffectOf(defs, 'boiler'), step)
}

export function cargoCapacityAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): number {
  return wholePerPurchaseAtStep(wholePerPurchaseEffectOf(defs, 'cargo_hold'), step)
}

export function engineStatsAtStep(step: number, defs: UpgradeDefs = ECONOMY.upgrades): EngineStats {
  return enginePerPurchaseAtStep(enginePerPurchaseEffectOf(defs, 'engine'), step)
}

/** Energy a rescue tow always leaves: 25% of `energyMax` (#9), so a broke player can still dig. */
export function rescueEnergyFloor(boilerStep: number): BigStat {
  return mul(ECONOMY.energy.rescueFloorFraction, fromSafeInteger(energyMaxAtStep(boilerStep)))
}

/**
 * The level an on-curve player holds at the end of planet `p` (#6 section 3): a major, or drill
 * power's purchase count (#552).
 */
export function onCurveLevel(upgradeId: UpgradeId, planetIndex: number): number {
  const { levelAtPlanet1, levelsPerPlanet, atMost } = upgradeDefOf(
    ECONOMY.upgrades,
    upgradeId,
  ).onCurve
  const level = levelAtPlanet1 + levelsPerPlanet * (planetIndex - FIRST_PLANET)
  return atMost === null ? level : Math.min(level, atMost)
}

/** The stored step of a track's on-curve level at the end of planet `p`: no pip. */
export function onCurveStep(upgradeId: UpgradeId, planetIndex: number): number {
  return stepOfLevel(upgradeId, onCurveLevel(upgradeId, planetIndex))
}

export function onCurveLevels(planetIndex: number): UpgradeLevels {
  return levelsOf((upgradeId) => onCurveLevel(upgradeId, planetIndex))
}

/** The steps an on-curve player holds at the end of planet `p`: its levels, no pip. */
export function onCurveSteps(planetIndex: number): UpgradeLevels {
  return levelsOf((upgradeId) => onCurveStep(upgradeId, planetIndex))
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

function upgradeDefOf(defs: UpgradeDefs, upgradeId: UpgradeId): UpgradeDef {
  const upgrade = defs.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId} in the definitions`)
  return upgrade
}

function perPurchaseEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): PerPurchaseEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'perPurchase') throw new RangeError(`${upgradeId} is not per purchase`)
  return effect
}

function geometricEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): GeometricEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'geometric') throw new RangeError(`${upgradeId} is not geometric`)
  return effect
}

function wholePerPurchaseEffectOf(defs: UpgradeDefs, upgradeId: UpgradeId): WholePerPurchaseEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'wholePerPurchase') {
    throw new RangeError(`${upgradeId} is not a whole stat per purchase`)
  }
  return effect
}

function enginePerPurchaseEffectOf(
  defs: UpgradeDefs,
  upgradeId: UpgradeId,
): EnginePerPurchaseEffect {
  const { effect } = upgradeDefOf(defs, upgradeId)
  if (effect.family !== 'enginePerPurchase') {
    throw new RangeError(`${upgradeId} is not an engine per purchase`)
  }
  return effect
}
