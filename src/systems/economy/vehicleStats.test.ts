import { describe, expect, it } from 'vitest'
import { cmp, div, fromCanonical, mul, powInt, toFixedText } from '../money'
import { UPGRADE_IDS, type UpgradeId } from './economyDefinition'
import { ECONOMY } from './economy'
import {
  cargoCapacity,
  vehicleStatsAt,
  drillPower,
  drillTip,
  energyMax,
  engineStats,
  hullMax,
  onCurveLevel,
  startLevels,
  visualTier,
  type UpgradeLevels,
} from './vehicleStats'
import { stepsOfMajors } from './upgradeSteps'

const m = fromCanonical
const PLANETS_1_TO_40 = Array.from({ length: 40 }, (_, index) => index + 1)
const LEVELS = [0, 1, 10, 1000, 1_000_000]
/** The tank, the hold and the engine are plain numbers, tested to purchase 200 (ticket 553). */
const PURCHASES = [0, 1, 10, 100, 200]

function levelsWith(changes: Partial<Record<UpgradeId, number>>): UpgradeLevels {
  return { ...startLevels(), ...changes }
}

/** The stored steps of these major levels: the visual tier counts majors (#180). */
function stepsWith(majors: Partial<Record<UpgradeId, number>>): UpgradeLevels {
  return stepsOfMajors(levelsWith(majors))
}

describe('vehicle stats', () => {
  it('starts every track at its 1.0x value at level 0', () => {
    expect(vehicleStatsAt(startLevels())).toEqual({
      drillPower: m('1.5'),
      drillTip: m('1'),
      gateTip: m('1'),
      hullMax: m('100'),
      energyMax: 150,
      cargoCapacity: 10,
      engine: { speedMax: 6, accel: 1, thrustToWeight: 2 },
    })
  })

  it('grows hull by "1.12" and the tip by "1.2544" per level', () => {
    expect(hullMax(2)).toEqual(m('125.44'))
    expect(drillTip(7)).toEqual(powInt(m('1.2544'), 7))
  })

  it('grows drill power by "1.243" a purchase after the first (#551, ticket 552)', () => {
    const gain = div(drillPower(19), drillPower(13))
    expect(toFixedText(gain, 30)).toBe(toFixedText(powInt(m('1.243'), 6), 30))
  })

  it('grows hull by 1.12^6 over the six levels of one planet', () => {
    expect(mul(hullMax(2), powInt(m('1.12'), 6))).toEqual(hullMax(8))
  })

  it('adds 10% to the tank and the hold a purchase, rounded to whole units (ticket 553)', () => {
    expect([energyMax(0), energyMax(1), energyMax(16)]).toEqual([150, 165, 689])
    expect([cargoCapacity(0), cargoCapacity(1), cargoCapacity(22)]).toEqual([10, 11, 81])
  })

  it('runs the engine at 6 x 1.05^e m/s with no top, accel and lift scaled with it (ticket 553)', () => {
    expect(engineStats(0)).toEqual({ speedMax: 6, accel: 1, thrustToWeight: 2 })
    expect(engineStats(58).speedMax).toBeGreaterThan(100)
  })

  it('is finite and increasing in level for every track, to a million or to purchase 200', () => {
    for (const [lower, higher] of LEVELS.slice(1).map((level, index) => [LEVELS[index], level])) {
      expect(cmp(drillPower(lower), drillPower(higher))).toBe(-1)
      expect(cmp(drillTip(lower), drillTip(higher))).toBe(-1)
      expect(cmp(hullMax(lower), hullMax(higher))).toBe(-1)
    }
    const pairs = PURCHASES.slice(1).map((purchase, index) => [PURCHASES[index], purchase])
    for (const [lower, higher] of pairs) {
      expect(energyMax(lower)).toBeLessThan(energyMax(higher))
      expect(cargoCapacity(lower)).toBeLessThan(cargoCapacity(higher))
      expect(engineStats(lower).speedMax).toBeLessThan(engineStats(higher).speedMax)
    }
  })

  it('declares drill power, the engine, the boiler and the hold per purchase and the tip and hull geometric', () => {
    const familyOf = (upgradeId: UpgradeId) =>
      ECONOMY.upgrades.find((upgrade) => upgrade.id === upgradeId)?.effect.family
    expect(UPGRADE_IDS.map(familyOf)).toEqual([
      'perPurchase',
      'geometric',
      'enginePerPurchase',
      'wholePerPurchase',
      'wholePerPurchase',
      'geometric',
    ])
  })
})

describe('on-curve levels', () => {
  it.each([
    ['boiler', 0, 16],
    ['engine', 3, 2],
    ['hull', 6, 2],
    ['drill_power', 3, 12],
    ['drill_tip', 3, 7],
  ] as const)('puts %s at %i(p-1)+%i on planets 1 to 40', (upgradeId, perPlanet, atPlanet1) => {
    for (const planet of PLANETS_1_TO_40) {
      expect(onCurveLevel(upgradeId, planet)).toBe(perPlanet * (planet - 1) + atPlanet1)
    }
  })

  // Systems' rows on #553: the bot's hold stops at 255 units (34 purchases) from planet 12, past
  // the largest band's ore, and the engine's last purchase under the 3600 m/s floor is 131.
  it('stops the hold at 34 purchases and the engine at 131 on curve (ticket 553)', () => {
    expect([1, 12, 13, 40, 1000].map((planet) => onCurveLevel('cargo_hold', planet))).toEqual([
      22, 33, 34, 34, 34,
    ])
    expect([1, 40, 44, 45, 1_000_000].map((planet) => onCurveLevel('engine', planet))).toEqual([
      2, 119, 131, 131, 131,
    ])
  })

  it('stays a finite, never falling level on planets 1000 and a million (the boiler holds 16)', () => {
    for (const upgradeId of UPGRADE_IDS) {
      const levels = [40, 1000, 1_000_000].map((planet) => onCurveLevel(upgradeId, planet))
      expect(levels.every(Number.isSafeInteger)).toBe(true)
      expect(levels).toEqual([...levels].sort((a, b) => a - b))
    }
  })
})

describe('vehicle visual tier', () => {
  it.each([
    [7, 1],
    [8, 2],
    [19, 2],
    [20, 3],
  ])('shows a total of %i levels as tier %i', (total, tier) => {
    expect(visualTier(stepsWith({ hull: total }))).toBe(tier)
  })

  it('gives the same tier for the same total in any spread over the tracks', () => {
    expect(visualTier(stepsWith({ hull: 4, boiler: 4 }))).toBe(2)
    expect(visualTier(stepsWith({ drill_tip: 1, cargo_hold: 7 }))).toBe(2)
    expect(visualTier(stepsWith({ engine: 10, drill_power: 9, hull: 1 }))).toBe(3)
  })

  it('counts major levels, so nine pips short of the eighth major is still tier 1', () => {
    expect(visualTier(levelsWith({ hull: 79 }))).toBe(1)
    expect(visualTier(levelsWith({ hull: 80 }))).toBe(2)
  })

  it('starts at tier 1', () => {
    expect(visualTier(startLevels())).toBe(1)
  })
})
