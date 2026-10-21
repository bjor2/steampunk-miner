/**
 * Enemy scaling (decision #9, coefficients from #6 section 5):
 *   enemyTier(p, b) = 1 + 6(p-1) + (b-1)
 *   health = Hk * 1.12^T          baseHit = Dk * 1.12^T          (BigStat, integer power)
 *   move, detection, cooldown = min + (max - min) * T / (T + 60)  (bounded numbers)
 * Because drill power, hull and enemies all grow 1.12 per level and 6 levels per planet, an
 * on-curve player meets the same fight on every planet (the #9 parity rule).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ceil, cmp, div, fromSafeInteger, mul, toSafeInteger, type BigStat } from '../money'
import { radiusTilesUnder, type PlanetParams } from '../world/planetParams'
import { compoundRatio, growGeometric, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import type { EnemyDef, EnemyKind, HitArc } from './economyDefinition'
import { blockHardness } from './oreEconomy'
import { drillPower, hullMax } from './vehicleStats'

const { enemies } = ECONOMY
const FIRST_PLANET = 1
const FIRST_BAND = 1
const TICKS_PER_SECOND_STAT = fromSafeInteger(TICKS_PER_SECOND)
const FULL_DENSITY = fromSafeInteger(1)
const MOST_TICKS = fromSafeInteger(Number.MAX_SAFE_INTEGER)

export interface EnemyBoundedStats {
  moveTilesPerSecond: number
  detectionTiles: number
  /** Whole ticks, rounded up so an attack never comes sooner than the formula says. */
  attackCooldownTicks: number
  windupTicks: number
  lungeTicks: number
  lungeTiles: number
  recoilTicks: number
}

export function enemyTier(planetIndex: number, band: number): number {
  const { first, perPlanet, perBand } = enemies.tier
  return first + perPlanet * (planetIndex - FIRST_PLANET) + perBand * (band - FIRST_BAND)
}

export function enemyHealth(kind: EnemyKind, tier: number): BigStat {
  return growGeometric(enemyDefOf(kind).health, enemies.growth, tier)
}

/** The hit before the front/side/rear multiplier (#9). */
export function enemyBaseHit(kind: EnemyKind, tier: number): BigStat {
  return growGeometric(enemyDefOf(kind).baseHit, enemies.growth, tier)
}

export function enemyBoundedStats(kind: EnemyKind, tier: number): EnemyBoundedStats {
  const enemy = enemyDefOf(kind)
  const halfTier = enemies.saturationTier
  return {
    moveTilesPerSecond: saturate(enemy.moveTilesPerSecond, tier, halfTier),
    detectionTiles: saturate(enemy.detectionTiles, tier, halfTier),
    attackCooldownTicks: Math.ceil(saturate(enemy.attackCooldownTicks, tier, halfTier)),
    windupTicks: enemy.windupTicks,
    lungeTicks: enemy.lungeTicks,
    lungeTiles: lungeTilesOf(enemy),
    recoilTicks: enemy.recoilTicks,
  }
}

/** What one hit from the `arc` zone takes off the hull: 0.25, 1 or 2 times the base hit (#9). */
export function enemyHitOnVehicle(kind: EnemyKind, tier: number, arc: HitArc): BigStat {
  return mul(enemyBaseHit(kind, tier), arcMultiplierOf(arc))
}

/**
 * The drill's damage on an enemy per second: `drillPower * kDrillVsEnemy` (#9), where
 * `kDrillVsEnemy` is one constant of economy.json, the same at every drill power and level.
 */
export function drillDamagePerSecond(drillPower: BigStat): BigStat {
  return mul(drillPower, enemies.combat.kDrillVsEnemy)
}

/** What a damage rate per second takes off an enemy in one tick: a sixtieth of it. */
export function enemyDamagePerTick(damagePerSecond: BigStat): BigStat {
  return div(damagePerSecond, TICKS_PER_SECOND_STAT)
}

/** A pinned enemy loses `drillPower * kDrillVsEnemy` per second, a sixtieth of it per tick (#9). */
export function pinnedDrillDamagePerTick(drillPower: BigStat): BigStat {
  return enemyDamagePerTick(drillDamagePerSecond(drillPower))
}

/** Seconds a pinned enemy survives on the drill: `health / (drillPower * kDrillVsEnemy)`. */
export function pinnedKillSeconds(kind: EnemyKind, tier: number, drillLevel: number): BigStat {
  return div(enemyHealth(kind, tier), drillDamagePerSecond(drillPower(drillLevel)))
}

/**
 * The ticks an enemy engaged on the drill's nose lives (ticket 564, the TD's dwell as the VS
 * amended it on #551, 6254978633): `max(1, ceil(health * 60 / damagePerSecond))`, with no tier
 * threshold and no speed input, so an under-tier enemy dies in one tick and time to kill is
 * continuous in tier. Past a safe integer of ticks it is held at the largest one.
 */
export function noseDwellTicks(health: BigStat, damagePerSecond: BigStat): number {
  const ticks = ceil(div(mul(health, TICKS_PER_SECOND_STAT), damagePerSecond))
  if (cmp(ticks, MOST_TICKS) > 0) return Number.MAX_SAFE_INTEGER
  return Math.max(1, toSafeInteger(ticks))
}

/** Whether `kind` always holds a rig its nose meets, by the `enemies.holdsTheRig` table (ticket 564). */
export function isRigHolderKind(kind: string): boolean {
  return enemies.holdsTheRig[kind] === true
}

/**
 * The hardness of the rock an enemy tier belongs to (ticket 564, the TD's ruling 3 on #551): the
 * planet and band `enemyTier` maps to that tier, read back (band 6 being the core material's), at
 * `blockHardness`. The drill's gate tip against it is the ground gates' own comparison, so an
 * enemy is tougher than the rig exactly where its band's rock would stop the drill.
 */
export function enemyRockHardness(tier: number): BigStat {
  const { first, perPlanet, perBand } = enemies.tier
  const steps = Math.max(0, tier - first)
  const planetIndex = FIRST_PLANET + Math.floor(steps / perPlanet)
  const band = FIRST_BAND + Math.floor((steps % perPlanet) / perBand)
  return blockHardness(planetIndex, band)
}

/** The share of `hullMax` one side hit removes (#9: 15 to 25% on-curve). */
export function sideHitShareOfHull(kind: EnemyKind, tier: number, hullLevel: number): BigStat {
  const sideHit = mul(enemyBaseHit(kind, tier), enemies.combat.kSidePlayer)
  return div(sideHit, hullMax(hullLevel))
}

/** What the spawn density reads of a planet: its index, its radius and the rules that sized it. */
export type SizedPlanet = Pick<PlanetParams, 'planetIndex' | 'radiusTiles' | 'oreRulesVersion'>

/**
 * The multiplier on every band's spawn density (#131 Systems):
 * `m(p) = max(floor, min(1, (R(ref) / R(p))^exponent))` from `fromPlanet` on, 1 before it. R(p) is
 * the planet's own radius and R(ref) the reference planet's under the same ore rules, so a planet
 * sized by the registry (ticket 643) is compared with a registry planet and a save's with the ladder.
 */
export function spawnDensityScale(planet: SizedPlanet): BigStat {
  if (planet.planetIndex < enemies.combat.densityByRadius.fromPlanet) return FULL_DENSITY
  return clampSpawnDensityScale(radiusRatioPower(planet))
}

export function enemyDefOf(kind: EnemyKind): EnemyDef {
  const enemy = enemies.kinds.find((candidate) => candidate.id === kind)
  if (enemy === undefined) throw new RangeError(`no enemy ${kind} in economy.json`)
  return enemy
}

function arcMultiplierOf(arc: HitArc): BigStat {
  const { kFrontPlayer, kSidePlayer, kRearPlayer } = enemies.combat
  if (arc === 'front') return kFrontPlayer
  return arc === 'side' ? kSidePlayer : kRearPlayer
}

function lungeTilesOf(enemy: EnemyDef): number {
  return (enemy.lungeTilesPerSecond * enemy.lungeTicks) / TICKS_PER_SECOND
}

function radiusRatioPower(planet: SizedPlanet): BigStat {
  const { refPlanet, exponent } = enemies.combat.densityByRadius
  const ratio = div(
    fromSafeInteger(radiusTilesUnder(refPlanet, planet.oreRulesVersion)),
    fromSafeInteger(planet.radiusTiles),
  )
  return compoundRatio(ratio, exponent)
}

function clampSpawnDensityScale(scale: BigStat): BigStat {
  const { floor } = enemies.combat.densityByRadius
  if (cmp(scale, FULL_DENSITY) > 0) return FULL_DENSITY
  return cmp(scale, floor) < 0 ? floor : scale
}
