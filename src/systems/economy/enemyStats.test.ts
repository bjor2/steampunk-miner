import { describe, expect, it } from 'vitest'
import {
  add,
  ceil,
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  toCanonical,
  type Money,
} from '../money'
import { radiusForPlanet } from '../world/planetParams'
import { ENEMY_KINDS } from './economyDefinition'
import { ECONOMY } from './economy'
import {
  drillDamagePerSecond,
  enemyBaseHit,
  enemyBoundedStats,
  enemyHealth,
  enemyHitOnVehicle,
  enemyRockHardness,
  enemyTier,
  isRigHolderKind,
  noseDwellTicks,
  pinnedDrillDamagePerTick,
  sideHitShareOfHull,
  spawnDensityScale,
} from './enemyStats'
import { blockHardness } from './oreEconomy'
import { drillPower, engineStats, hullMax, onCurveLevel } from './vehicleStats'

const m = fromCanonical
const ZERO = fromSafeInteger(0)
const PLANETS_1_TO_40 = Array.from({ length: 40 }, (_, index) => index + 1)
const BANDS = [1, 2, 3, 4, 5]
const TIERS = [1, 10, 100, 1000]
const ON_CURVE_TIERS = PLANETS_1_TO_40.flatMap((planet) =>
  BANDS.map((band) => enemyTier(planet, band)),
)

function isWithin(value: Money, low: string, high: string): boolean {
  return cmp(value, m(low)) >= 0 && cmp(value, m(high)) <= 0
}

describe('enemy stats', () => {
  it('numbers enemy tiers 1 + 6(p-1) + (b-1)', () => {
    expect(BANDS.map((band) => enemyTier(1, band))).toEqual([1, 2, 3, 4, 5])
    expect(enemyTier(2, 1)).toBe(7)
    expect(enemyTier(40, 5)).toBe(239)
  })

  it('gives a tunnel wrecker 10 * 1.12^T health and 6 * 1.12^T hit from planet 6 in bands 2 to 5 (#111)', () => {
    expect(enemyHealth('tunnel_wrecker', 1)).toEqual(m('11.2'))
    expect(enemyBaseHit('tunnel_wrecker', 1)).toEqual(m('6.72'))
    const wrecker = ECONOMY.enemies.kinds.find((kind) => kind.id === 'tunnel_wrecker')
    expect(wrecker).toMatchObject({ firstPlanet: 6, bands: [2, 3, 4, 5] })
    expect(enemyBoundedStats('tunnel_wrecker', 1).detectionTiles).toBe(12)
  })

  it('walks a tunnel wrecker at 1.0 to 1.5 tiles/s, slow enough for the guns to finish it (#126)', () => {
    const wrecker = ECONOMY.enemies.kinds.find((kind) => kind.id === 'tunnel_wrecker')
    expect(wrecker).toEqual({
      id: 'tunnel_wrecker',
      health: m('10'),
      baseHit: m('6'),
      firstPlanet: 6,
      bands: [2, 3, 4, 5],
      moveTilesPerSecond: { min: 1.0, max: 1.5 },
      detectionTiles: { min: 12, max: 12 },
      attackCooldownTicks: { min: 90, max: 45 },
      windupTicks: 24,
      lungeTilesPerSecond: 8,
      lungeTicks: 30,
      recoilTicks: 30,
    })
  })

  it("holds the tunnel wrecker's route numbers as Systems set them (#111)", () => {
    expect(ECONOMY.enemies.tunnelWrecker).toEqual({
      gnawTicksPerRing: 300,
      fleeTiles: 12,
      ignoreVehicleTiles: 20,
      minLinedRings: 20,
      maxAliveByPlanet: [
        { from: 6, n: 1 },
        { from: 10, n: 2 },
      ],
      respawnTicks: 3600,
    })
  })

  it('gives a crawler 7 * 1.12^T health and 17.5 * 1.12^T hit, a burrower 16.5 * 1.12^T hit', () => {
    expect(enemyHealth('crawler', 1)).toEqual(m('7.84'))
    expect(enemyBaseHit('crawler', 1)).toEqual(m('19.6'))
    expect(enemyBaseHit('burrower', 1)).toEqual(m('18.48'))
  })

  it('keeps health and hit finite and increasing over tiers 1, 10, 100 and 1000', () => {
    for (const kind of ENEMY_KINDS) {
      for (const [lower, higher] of [
        [1, 10],
        [10, 100],
        [100, 1000],
      ]) {
        expect(cmp(enemyHealth(kind, lower), enemyHealth(kind, higher))).toBe(-1)
        expect(cmp(enemyBaseHit(kind, lower), enemyBaseHit(kind, higher))).toBe(-1)
      }
    }
  })
})

describe('enemy fairness invariants (#9)', () => {
  it('winds every attack up for at least 24 ticks at every tier, on-curve tiers included', () => {
    for (const kind of ENEMY_KINDS) {
      for (const tier of [...TIERS, ...ON_CURVE_TIERS]) {
        const { windupTicks, attackCooldownTicks } = enemyBoundedStats(kind, tier)
        expect(windupTicks).toBeGreaterThanOrEqual(24)
        // A pinned enemy strikes once per cooldown, so the cooldown is its wind-up too.
        expect(attackCooldownTicks).toBeGreaterThanOrEqual(windupTicks)
      }
    }
  })

  it('keeps the crawler at 2 to 4 tiles/s, under the level-0 engine speed', () => {
    for (const tier of TIERS) {
      const speed = enemyBoundedStats('crawler', tier).moveTilesPerSecond
      expect(speed).toBeGreaterThanOrEqual(2)
      expect(speed).toBeLessThanOrEqual(4)
      expect(speed).toBeLessThan(engineStats(0).speedMax)
    }
  })

  it('keeps every lunge to at most 30 ticks and 6 tiles', () => {
    for (const kind of ENEMY_KINDS) {
      const { lungeTicks, lungeTiles } = enemyBoundedStats(kind, 1000)
      expect(lungeTicks).toBeLessThanOrEqual(30)
      expect(lungeTiles).toBeLessThanOrEqual(6)
    }
  })

  it.each([
    ['crawler', 'detectionTiles', 10, 16],
    ['burrower', 'detectionTiles', 8, 12],
    ['burrower', 'moveTilesPerSecond', 1.5, 3],
    ['crawler', 'attackCooldownTicks', 45, 90],
    ['burrower', 'attackCooldownTicks', 45, 90],
  ] as const)('keeps the %s %s between %d and %d', (kind, stat, low, high) => {
    const values = TIERS.map((tier) => enemyBoundedStats(kind, tier)[stat])
    expect(Math.min(...values)).toBeGreaterThanOrEqual(low)
    expect(Math.max(...values)).toBeLessThanOrEqual(high)
  })

  it('moves bounded stats one way only as the tier rises', () => {
    const cooldowns = TIERS.map((tier) => enemyBoundedStats('crawler', tier).attackCooldownTicks)
    const detection = TIERS.map((tier) => enemyBoundedStats('crawler', tier).detectionTiles)
    expect(cooldowns).toEqual([...cooldowns].sort((a, b) => b - a))
    expect(detection).toEqual([...detection].sort((a, b) => a - b))
  })

  it('reads the combat constants from the data file', () => {
    const { combat } = ECONOMY.enemies
    expect([
      combat.kFrontPlayer,
      combat.kSidePlayer,
      combat.kRearPlayer,
      combat.kDrillVsEnemy,
    ]).toEqual(['0.25', '1', '2', '1'].map(m))
    expect(combat.hitGraceTicks).toBe(20)
    expect(combat.maxActivePerVehicle).toBe(6)
    expect([combat.activationTiles, combat.despawnTiles]).toEqual([24, 48])
    expect(combat.spawnPointsPer10ChunksByBand).toEqual([0, 5, 10, 15, 10])
    expect(combat.burrowerShare).toEqual({ numerator: 1, denominator: 3 })
  })
})

describe('enemy hits and the pinned drill (#9, #25 acceptance 2 and 3)', () => {
  it('takes a quarter, one and two base hits for front, side and rear', () => {
    expect(
      ['front', 'side', 'rear'].map((arc) => enemyHitOnVehicle('crawler', 1, arc as never)),
    ).toEqual(['4.9', '19.6', '39.2'].map(m))
  })

  it('kills a tier 1 crawler pinned on the planet 1 on-curve drill, 12 purchases, in 29 ticks', () => {
    const perTick = pinnedDrillDamagePerTick(drillPower(12))
    expect(toCanonical(mul(perTick, m('60')))).toBe(toCanonical(drillPower(12)))
    expect(ceil(div(enemyHealth('crawler', 1), perTick))).toEqual(m('29'))
  })

  it('never lets one rear hit destroy a full on-curve hull, and needs 4 side or 2 rear hits', () => {
    for (const planet of PLANETS_1_TO_40) {
      const hull = hullMax(onCurveLevel('hull', planet))
      for (const band of BANDS) {
        const tier = enemyTier(planet, band)
        const side = enemyHitOnVehicle('crawler', tier, 'side')
        const rear = enemyHitOnVehicle('crawler', tier, 'rear')
        expect(cmp(rear, hull)).toBe(-1)
        expect(cmp(add(add(side, side), side), hull)).toBe(-1)
      }
    }
  })
})

describe('enemy parity with an on-curve player (#9, #20 acceptance 4)', () => {
  it('takes 15 to 25% of hull per side hit', () => {
    for (const planet of PLANETS_1_TO_40) {
      const hullLevel = onCurveLevel('hull', planet)
      for (const band of BANDS) {
        const tier = enemyTier(planet, band)
        expect(isWithin(sideHitShareOfHull('crawler', tier, hullLevel), '0.15', '0.25')).toBe(true)
      }
    }
  })

  // #6 acceptance 3 and table D state the one-planet-behind case for band 3 (39%).
  it('takes 30 to 50% of hull per side hit in band 3 one planet behind', () => {
    for (const planet of PLANETS_1_TO_40.slice(1)) {
      const hullLevel = onCurveLevel('hull', planet - 1)
      const tier = enemyTier(planet, 3)
      expect(isWithin(sideHitShareOfHull('crawler', tier, hullLevel), '0.30', '0.50')).toBe(true)
    }
  })

  // Drill damage still follows drill power, which grows x1.243 a purchase since #552 against
  // enemy health's 1.12 a tier: on curve a pinned crawler now dies in 0.48 s (band 1, planet 1) to
  // 1.4 s (planet 40), table D. The GD ruled combat damage its own design ticket (#555, on #551).
  it.todo(
    'kills a pinned crawler in 1.0 to 2.0 s on curve (#20 acceptance 4; waits on the combat damage design of #555)',
  )
  it.todo(
    'kills a pinned band-3 crawler in 2.5 to 5 s one planet behind (#6 acceptance 3; waits on the combat damage design of #555)',
  )
})

/** `(R(6) / R(p))^2`, the landed density step of #131 written out. */
function squaredRadiusRatioTo6(planetIndex: number): Money {
  const ratio = div(
    fromSafeInteger(radiusForPlanet(6)),
    fromSafeInteger(radiusForPlanet(planetIndex)),
  )
  return mul(ratio, ratio)
}

describe('spawn density by planet size (#131)', () => {
  it('keeps every band at full density on planets 1 to 6', () => {
    for (const planet of [1, 2, 3, 4, 5, 6]) expect(spawnDensityScale(planet)).toEqual(m('1'))
  })

  it('thins every band from planet 7 by (R(6) / R(p))^2, so planet 9 keeps (618 / 700)^2', () => {
    expect(radiusForPlanet(9)).toBe(700)
    expect(spawnDensityScale(7)).toEqual(squaredRadiusRatioTo6(7))
    expect(spawnDensityScale(9)).toEqual(squaredRadiusRatioTo6(9))
  })

  it('holds the 0.6 floor from planet 16, where (618 / 800)^2 falls under it', () => {
    expect(cmp(spawnDensityScale(15), m('0.6'))).toBeGreaterThan(0)
    expect(spawnDensityScale(16)).toEqual(m('0.6'))
    expect(spawnDensityScale(40)).toEqual(m('0.6'))
  })
})

describe('nose contact inputs (ticket 564, the TD and VS rulings on #551)', () => {
  const DRILL_LEVELS = [1, 8, 20, 60, 200]

  it('scales drill damage by one kDrillVsEnemy that depends on neither drill power nor level', () => {
    const k = ECONOMY.enemies.combat.kDrillVsEnemy
    for (const level of DRILL_LEVELS) {
      expect(div(drillDamagePerSecond(drillPower(level)), drillPower(level))).toEqual(k)
    }
  })

  it('dwells max(1, ceil(health x 60 / damage per second)) ticks, as the pinned drill kills', () => {
    const rate = drillDamagePerSecond(drillPower(12))
    expect(noseDwellTicks(enemyHealth('crawler', 1), rate)).toBe(29)
    expect(noseDwellTicks(m('0.001'), rate)).toBe(1)
    expect(noseDwellTicks(ZERO, rate)).toBe(1)
  })

  it('kills an under-tier enemy in one tick and grows the dwell with tier, with no threshold', () => {
    const rate = drillDamagePerSecond(drillPower(20))
    const dwells = Array.from({ length: 60 }, (_, index) =>
      noseDwellTicks(enemyHealth('crawler', index + 1), rate),
    )
    for (let index = 1; index < dwells.length; index++) {
      expect(dwells[index]).toBeGreaterThanOrEqual(dwells[index - 1])
      expect(dwells[index]).toBeLessThanOrEqual(Math.ceil(dwells[index - 1] * 1.12) + 1)
    }
    expect(noseDwellTicks(enemyHealth('crawler', 1), m('1000'))).toBe(1)
  })

  it('reads an enemy tier back to the rock of the planet and band it was made for', () => {
    for (const planet of PLANETS_1_TO_40) {
      for (const band of [...BANDS, 6]) {
        expect(enemyRockHardness(enemyTier(planet, band))).toEqual(blockHardness(planet, band))
      }
    }
    expect(enemyRockHardness(0)).toEqual(blockHardness(1, 1))
  })

  it('makes the wrecker and the core guardian hold the rig, and every built kind state it', () => {
    for (const kind of ENEMY_KINDS) {
      expect(typeof ECONOMY.enemies.holdsTheRig[kind]).toBe('boolean')
    }
    expect(['tunnel_wrecker', 'core_guardian'].every(isRigHolderKind)).toBe(true)
    expect(['crawler', 'burrower', 'ore_thief'].some(isRigHolderKind)).toBe(false)
  })
})
