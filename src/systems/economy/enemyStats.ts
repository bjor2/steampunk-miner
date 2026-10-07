/**
 * Enemy scaling (decision #9, coefficients from #6 section 5):
 *   enemyTier(p, b) = 1 + 6(p-1) + (b-1)
 *   health = Hk * 1.12^T          baseHit = Dk * 1.12^T          (BigStat, integer power)
 *   move, detection, cooldown = min + (max - min) * T / (T + 60)  (bounded numbers)
 * Because drill power, hull and enemies all grow 1.12 per level and 6 levels per planet, an
 * on-curve player meets the same fight on every planet (the #9 parity rule).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { cmp, div, fromSafeInteger, mul, type BigStat } from '../money'
import { radiusForPlanet } from '../world/planetParams'
import { compoundRatio, growGeometric, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import type { EnemyDef, EnemyKind, HitArc } from './economyDefinition'
import { drillPower, hullMax } from './vehicleStats'

const { enemies } = ECONOMY
const FIRST_PLANET = 1
const FIRST_BAND = 1
const TICKS_PER_SECOND_STAT = fromSafeInteger(TICKS_PER_SECOND)
const FULL_DENSITY = fromSafeInteger(1)

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

/** A pinned enemy loses `drillPower * kDrillVsEnemy` per second, a sixtieth of it per tick (#9). */
export function pinnedDrillDamagePerTick(drillPower: BigStat): BigStat {
  return div(mul(drillPower, enemies.combat.kDrillVsEnemy), TICKS_PER_SECOND_STAT)
}

/** Seconds a pinned enemy survives on the drill: `health / (drillPower * kDrillVsEnemy)`. */
export function pinnedKillSeconds(kind: EnemyKind, tier: number, drillLevel: number): BigStat {
  const damagePerSecond = mul(drillPower(drillLevel), enemies.combat.kDrillVsEnemy)
  return div(enemyHealth(kind, tier), damagePerSecond)
}

/** The share of `hullMax` one side hit removes (#9: 15 to 25% on-curve). */
export function sideHitShareOfHull(kind: EnemyKind, tier: number, hullLevel: number): BigStat {
  const sideHit = mul(enemyBaseHit(kind, tier), enemies.combat.kSidePlayer)
  return div(sideHit, hullMax(hullLevel))
}

/**
 * The multiplier on every band's spawn density (#131 Systems):
 * `m(p) = max(floor, min(1, (R(ref) / R(p))^exponent))` from `fromPlanet` on, 1 before it.
 */
export function spawnDensityScale(planetIndex: number): BigStat {
  if (planetIndex < enemies.combat.densityByRadius.fromPlanet) return FULL_DENSITY
  return clampSpawnDensityScale(radiusRatioPower(planetIndex))
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

function radiusRatioPower(planetIndex: number): BigStat {
  const { refPlanet, exponent } = enemies.combat.densityByRadius
  const ratio = div(
    fromSafeInteger(radiusForPlanet(refPlanet)),
    fromSafeInteger(radiusForPlanet(planetIndex)),
  )
  return compoundRatio(ratio, exponent)
}

function clampSpawnDensityScale(scale: BigStat): BigStat {
  const { floor } = enemies.combat.densityByRadius
  if (cmp(scale, FULL_DENSITY) > 0) return FULL_DENSITY
  return cmp(scale, floor) < 0 ? floor : scale
}
