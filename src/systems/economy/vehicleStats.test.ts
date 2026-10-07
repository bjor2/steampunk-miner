import { describe, expect, it } from 'vitest'
import { cmp, fromCanonical, mul, powInt } from '../money'
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

  it('grows drill power and hull by "1.12" and the tip by "1.2544" per level', () => {
    expect(drillPower(13)).toEqual(mul(m('1.5'), powInt(m('1.12'), 13)))
    expect(hullMax(2)).toEqual(m('125.44'))
    expect(drillTip(7)).toEqual(powInt(m('1.2544'), 7))
  })

  it('grows drill power and hull by 1.12^6 over the six levels of one planet', () => {
    expect(mul(drillPower(13), powInt(m('1.12'), 6))).toEqual(drillPower(19))
    expect(mul(hullMax(2), powInt(m('1.12'), 6))).toEqual(hullMax(8))
  })

  it('adds 6 energy and 4 cargo units per level', () => {
    expect([energyMax(0), energyMax(4), energyMax(10)]).toEqual([150, 174, 210])
    expect([cargoCapacity(0), cargoCapacity(8), cargoCapacity(14)]).toEqual([10, 42, 66])
  })

  it('saturates the engine below 14 m/s, accel 1.8 and thrust-to-weight 3.5', () => {
    expect(engineStats(25)).toEqual({ speedMax: 10, accel: 1.4, thrustToWeight: 2.75 })
    for (const level of LEVELS) {
      const engine = engineStats(level)
      expect(engine.speedMax).toBeGreaterThanOrEqual(6)
      expect(engine.speedMax).toBeLessThan(14)
      expect(engine.accel).toBeLessThan(1.8)
      expect(engine.thrustToWeight).toBeLessThan(3.5)
    }
  })

  it('is finite and non-decreasing in level for every track from 0 to a million', () => {
    for (const [lower, higher] of LEVELS.slice(1).map((level, index) => [LEVELS[index], level])) {
      expect(cmp(drillPower(lower), drillPower(higher))).toBe(-1)
      expect(cmp(drillTip(lower), drillTip(higher))).toBe(-1)
      expect(cmp(hullMax(lower), hullMax(higher))).toBe(-1)
      expect(energyMax(lower)).toBeLessThan(energyMax(higher))
      expect(cargoCapacity(lower)).toBeLessThan(cargoCapacity(higher))
      expect(engineStats(lower).speedMax).toBeLessThan(engineStats(higher).speedMax)
    }
  })

  it('declares drill, tip and hull geometric, boiler and cargo linear and the engine saturating', () => {
    const familyOf = (upgradeId: UpgradeId) =>
      ECONOMY.upgrades.find((upgrade) => upgrade.id === upgradeId)?.effect.family
    expect(UPGRADE_IDS.map(familyOf)).toEqual([
      'geometric',
      'geometric',
      'saturating',
      'linear',
      'linear',
      'geometric',
    ])
  })
})

describe('on-curve levels', () => {
  it.each([
    ['cargo_hold', 6, 8],
    ['boiler', 6, 4],
    ['engine', 6, 6],
    ['hull', 6, 2],
    ['drill_power', 6, 13],
    ['drill_tip', 3, 7],
  ] as const)('puts %s at %i(p-1)+%i on planets 1 to 40', (upgradeId, perPlanet, atPlanet1) => {
    for (const planet of PLANETS_1_TO_40) {
      expect(onCurveLevel(upgradeId, planet)).toBe(perPlanet * (planet - 1) + atPlanet1)
    }
  })

  it('stays a finite, increasing level on planets 1000 and a million', () => {
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
