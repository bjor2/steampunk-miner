import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { UPGRADE_IDS, type UpgradeDef, type UpgradeId } from '../economy/economyDefinition'
import { startLevels, type UpgradeLevels, type VehicleStats } from '../economy/vehicleStats'
import { cmp, fromCanonical, toCanonical } from '../money'
import { computeVehicleStats } from './vehicleStats'

const LEVELS = [0, 1, 10, 1000, 1_000_000]

function levelsWith(changes: Partial<Record<UpgradeId, number>>): UpgradeLevels {
  return { ...startLevels(), ...changes }
}

function statsOf(levels: unknown, defs?: readonly UpgradeDef[]): VehicleStats {
  const reading = computeVehicleStats(levels, defs)
  if (!('stats' in reading)) throw new Error(reading.problems.join('; '))
  return reading.stats
}

/** Every stat of the vehicle as one comparable list: BigStats as decimals, numbers as they are. */
function statValues(stats: VehicleStats): (number | string)[] {
  return [
    toCanonical(stats.drillPower),
    toCanonical(stats.drillTip),
    toCanonical(stats.hullMax),
    stats.energyMax,
    stats.cargoCapacity,
    stats.engine.speedMax,
    stats.engine.accel,
    stats.engine.thrustToWeight,
  ]
}

function isNotBelow(next: VehicleStats, previous: VehicleStats): boolean {
  return (
    cmp(next.drillPower, previous.drillPower) >= 0 &&
    cmp(next.drillTip, previous.drillTip) >= 0 &&
    cmp(next.hullMax, previous.hullMax) >= 0 &&
    next.energyMax >= previous.energyMax &&
    next.cargoCapacity >= previous.cargoCapacity &&
    next.engine.speedMax >= previous.engine.speedMax &&
    next.engine.accel >= previous.engine.accel &&
    next.engine.thrustToWeight >= previous.engine.thrustToWeight
  )
}

describe('vehicle stats from integer levels', () => {
  it('gives the #6 start values at level 0', () => {
    const stats = statsOf(startLevels())
    expect([toCanonical(stats.drillPower), toCanonical(stats.drillTip)]).toEqual([
      toCanonical(fromCanonical('1.5')),
      toCanonical(fromCanonical('1')),
    ])
    expect(stats.hullMax).toEqual(fromCanonical('100'))
    expect([stats.energyMax, stats.cargoCapacity]).toEqual([150, 10])
    expect(stats.engine).toEqual({ speedMax: 6, accel: 1, thrustToWeight: 2 })
  })

  it('gives "1.68", "1.2544", "112", 156 and 14 at level 1 (step 10)', () => {
    const stats = statsOf(levelsWith(Object.fromEntries(UPGRADE_IDS.map((id) => [id, 10]))))
    expect(stats.drillPower).toEqual(fromCanonical('1.68'))
    expect(stats.drillTip).toEqual(fromCanonical('1.2544'))
    expect(stats.hullMax).toEqual(fromCanonical('112'))
    expect([stats.energyMax, stats.cargoCapacity]).toEqual([156, 14])
  })

  it('gives speed 10, accel 1.4 and twr 2.75 exactly at engine level 25 (step 250)', () => {
    expect(statsOf(levelsWith({ engine: 250 })).engine).toEqual({
      speedMax: 10,
      accel: 1.4,
      thrustToWeight: 2.75,
    })
  })

  it('stays finite and never falls as any track rises through 0, 1, 10, 1000 and 10^6', () => {
    for (const upgradeId of UPGRADE_IDS) {
      const series = LEVELS.map((level) => statsOf(levelsWith({ [upgradeId]: level })))
      series.forEach((stats) => expect(statValues(stats).every(isFiniteValue)).toBe(true))
      series.slice(1).forEach((stats, index) => expect(isNotBelow(stats, series[index])).toBe(true))
    }
  })

  it('keeps the engine under 14 m/s, 1.8x accel and twr 3.5 at any level', () => {
    for (const level of LEVELS) {
      const { engine } = statsOf(levelsWith({ engine: level }))
      expect(engine.speedMax).toBeLessThan(14)
      expect(engine.accel).toBeLessThan(1.8)
      expect(engine.thrustToWeight).toBeLessThan(3.5)
    }
  })

  it('refuses a level that is not a safe integer with a listed problem', () => {
    const reading = computeVehicleStats(levelsWith({ drill_tip: 1.5, hull: -1 }))
    expect(reading.problems).toEqual([
      'drill_tip level must be a safe integer >= 0, got 1.5',
      'hull level must be a safe integer >= 0, got -1',
    ])
    expect(computeVehicleStats({ ...startLevels(), laser: 2 }).problems).toEqual([
      'laser is not a registered upgrade id',
    ])
  })

  it('gives finite stats at drill_tip level 1500', () => {
    expect(isFiniteValue(toCanonical(statsOf(levelsWith({ drill_tip: 1500 })).drillTip))).toBe(true)
  })

  it('retunes the same saved levels when a coefficient in the definitions changes', () => {
    const levels = levelsWith({ boiler: 30 })
    const retuned = ECONOMY.upgrades.map((upgrade) =>
      upgrade.id === 'boiler' && upgrade.effect.family === 'linear'
        ? { ...upgrade, effect: { ...upgrade.effect, step: 10 } }
        : upgrade,
    )
    expect(statsOf(levels).energyMax).toBe(168)
    expect(statsOf(levels, retuned).energyMax).toBe(180)
  })
})

function isFiniteValue(value: number | string): boolean {
  return typeof value === 'number' ? Number.isFinite(value) : !/inf|nan/i.test(value)
}

describe('vehicle rule sources', () => {
  it('use no pow, **, exp, log or trig anywhere in src/systems/vehicle', () => {
    const directory = new URL('./', import.meta.url)
    const files = readdirSync(directory).filter(
      (name) => /\.ts$/.test(name) && !/\.test\./.test(name),
    )
    const inexact =
      /\*\*|Math\.(pow|exp|expm1|log\w*|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|hypot|cbrt)\b|\.pow\(/
    for (const name of files) {
      const code = readFileSync(new URL(name, directory), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect({ name, inexact: inexact.test(code) }).toEqual({ name, inexact: false })
    }
  })
})
