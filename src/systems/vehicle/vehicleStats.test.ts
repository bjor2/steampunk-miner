import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { UPGRADE_IDS, type UpgradeDef, type UpgradeId } from '../economy/economyDefinition'
import { startLevels, type UpgradeLevels, type VehicleStats } from '../economy/vehicleStats'
import { cmp, fromCanonical, toCanonical, toFixedText } from '../money'
import { computeVehicleStats } from './vehicleStats'

const LEVELS = [0, 1, 10, 1000, 1_000_000]
/** The tank, the hold and the engine are plain numbers per purchase, tested to 200 (ticket 553). */
const PURCHASES = [0, 1, 10, 100, 200]
const PLAIN_NUMBER_TRACKS: readonly UpgradeId[] = ['engine', 'boiler', 'cargo_hold']

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

  // Drill power is grown per purchase since #552, the boiler and the hold since ticket 553, so step
  // 10 is their tenth purchase.
  it('gives "10.69", "1.2544", "112", 389 and 26 at step 10', () => {
    const stats = statsOf(levelsWith(Object.fromEntries(UPGRADE_IDS.map((id) => [id, 10]))))
    expect(toFixedText(stats.drillPower, 2)).toBe('10.69')
    expect(stats.drillTip).toEqual(fromCanonical('1.2544'))
    expect(stats.hullMax).toEqual(fromCanonical('112'))
    expect([stats.energyMax, stats.cargoCapacity]).toEqual([389, 26])
  })

  it('gives speed 6 x 1.05^10, accel 1.05^10 and twr 1 + 1.05^10 in millionths at engine step 10', () => {
    expect(statsOf(levelsWith({ engine: 10 })).engine).toEqual({
      speedMax: 9.773368,
      accel: 1.628895,
      thrustToWeight: 2.628895,
    })
  })

  it('stays finite and never falls as any track rises, to 10^6 or to purchase 200', () => {
    for (const upgradeId of UPGRADE_IDS) {
      const levels = PLAIN_NUMBER_TRACKS.includes(upgradeId) ? PURCHASES : LEVELS
      const series = levels.map((level) => statsOf(levelsWith({ [upgradeId]: level })))
      series.forEach((stats) => expect(statValues(stats).every(isFiniteValue)).toBe(true))
      series.slice(1).forEach((stats, index) => expect(isNotBelow(stats, series[index])).toBe(true))
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
      upgrade.id === 'boiler' && upgrade.effect.family === 'wholePerPurchase'
        ? { ...upgrade, effect: { ...upgrade.effect, ratio: fromCanonical('1.2') } }
        : upgrade,
    )
    expect(statsOf(levels).energyMax).toBe(2617)
    expect(statsOf(levels, retuned).energyMax).toBe(35606)
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
