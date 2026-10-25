import { describe, expect, it } from 'vitest'
import scheduleFile from '../../../../docs/scaling/horizontal/stats.json'
import { jumpFeeOf, systemJumpFeeOf } from '../../../systems/economy/jumpFuel'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { fromCanonical, toCanonical, type BigStat } from '../../../systems/money'
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { freshRadiusTilesOf } from '../../../systems/world/planetParams'
import { economyRowProblemsOf } from './economyRowGuards'
import { planetEconomyRowOf, systemEconomyRowsOf, type PlanetEconomyRow } from './economyRows'
import { ARCHETYPE_PALETTE } from './paletteRows'

// A solar system's economy rows (ticket 776, spec #774): computed from the roster and system 1's
// laws at the contiguous campaign index g, held to the Campaign Scaling lock by the row guards.

const SEED = 20261024
const OTHER_SEED = 42
const SYSTEMS_2_TO_40 = Array.from({ length: 39 }, (_, at) => BigInt(at + 2))
const LAST_PLANET_OF_SYSTEM_1 = 5
/** Planet 40's count since ticket 900 added `blast_rock`; no row of this slice is in it. */
const P40_CUMULATIVE = 69

function textOf(amount: BigStat): string {
  return toCanonical(amount)
}

function ratioText(text: string): string {
  return toCanonical(fromCanonical(text))
}

function planetIndexOf(row: PlanetEconomyRow): number {
  return Number(row.campaignIndex)
}

function radiusBpOf(sizeClass: string): number {
  return ARCHETYPE_PALETTE.sizeClasses.classes.find((row) => row.id === sizeClass)?.radiusBp ?? 0
}

function withRow(row: PlanetEconomyRow, change: Partial<PlanetEconomyRow>): PlanetEconomyRow[] {
  return [{ ...row, ...change }]
}

describe('system economy rows', () => {
  it('computes the same rows on every read and refuses system 1', () => {
    const once = JSON.stringify(systemEconomyRowsOf(SEED, 2n))
    expect(JSON.stringify(systemEconomyRowsOf(SEED, 2n))).toBe(once)
    expect(() => systemEconomyRowsOf(SEED, 1n)).toThrow(RangeError)
    expect(() => planetEconomyRowOf(SEED, 2n, 6n)).toThrow(RangeError)
  })

  it("reads each band's ore tier off system 1's law at g, so system 2's surface is planet 5's band 4", () => {
    const rows = systemEconomyRowsOf(SEED, 2n)
    for (const row of rows) {
      expect(row.bandTiers).toEqual(
        [1, 2, 3, 4, 5].map((band) => oreTier(planetIndexOf(row), band)),
      )
    }
    expect(rows[0].bandTiers[0]).toBe(oreTier(LAST_PLANET_OF_SYSTEM_1, 4))
  })

  it('steps every value by x3.375 over the planet before, the jump between systems included', () => {
    for (const system of [2n, 3n, 10n, 1_000_000n]) {
      for (const row of systemEconomyRowsOf(SEED, system)) {
        expect(textOf(row.valueStep)).toBe(ratioText('3.375'))
      }
    }
  })

  it('sells the gems at t_top(g) + 5, 6 and 8, the kernel planet row at g', () => {
    const rows = systemEconomyRowsOf(SEED, 2n)
    for (const row of rows) {
      expect(row.gemSaleTiers).toEqual(gemSaleTiersOfPlanet(planetIndexOf(row)))
      expect(row.gemSaleTiers.map((tier) => tier - row.gemSaleTiers[0])).toEqual([0, 1, 3])
    }
    expect(rows[0].gemSaleTiers[0]).toBe(gemSaleTiersOfPlanet(LAST_PLANET_OF_SYSTEM_1)[0] + 3)
  })

  it("sizes each planet as system 1's radius at g times its size class, rounded to whole tiles", () => {
    for (const row of systemEconomyRowsOf(SEED, 2n)) {
      const radius = (freshRadiusTilesOf(planetIndexOf(row)) * radiusBpOf(row.sizeClass)) / 10000
      expect(row.radiusTiles).toBe(Math.round(radius))
    }
  })

  it("steps the ground k_jump on a system's first planet and k_s on its hard start, never both", () => {
    const two = systemEconomyRowsOf(SEED, 2n)
    expect(two.map((row) => textOf(row.arrivalStep))).toEqual(
      ['1.1', '1', '1', '1', '1.1'].map(ratioText),
    )
    expect(two.map((row) => textOf(row.hardnessStep))).toEqual(
      ['1.1', '1.1', '1.1', '1.1', '1.21'].map(ratioText),
    )
    const three = systemEconomyRowsOf(SEED, 3n)
    expect(textOf(three[0].arrivalStep)).toBe(ratioText('1'))
    expect(textOf(three[0].hardnessStep)).toBe(ratioText('1.21'))
  })

  it('charges the jump into a system at J times the hop and every other arrival at the hop', () => {
    const rows = systemEconomyRowsOf(SEED, 2n)
    expect(textOf(rows[0].arrivalFee)).toBe(textOf(systemJumpFeeOf(5, 6)))
    expect(textOf(rows[1].arrivalFee)).toBe(textOf(jumpFeeOf(6, 7)))
    expect(textOf(systemEconomyRowsOf(SEED, 3n)[0].arrivalFee)).toBe(
      textOf(systemJumpFeeOf(10, 11)),
    )
  })

  it("steps each pool by the value step times the radius ratio squared, system 1's planet 5 before system 2", () => {
    const [first] = systemEconomyRowsOf(SEED, 2n)
    const area = (first.radiusTiles / freshRadiusTilesOf(LAST_PLANET_OF_SYSTEM_1)) ** 2
    expect(Number(textOf(first.poolStep))).toBeCloseTo(3.375 * area, 12)
  })

  it('holds the lock on systems 2 to 40 under two seeds: no value step, steps under 1.243 and felt at 0.9x, R3 with gems at the cap', () => {
    for (const seed of [SEED, OTHER_SEED]) {
      const rows = SYSTEMS_2_TO_40.flatMap((system) => systemEconomyRowsOf(seed, system))
      expect(economyRowProblemsOf(rows)).toEqual([])
    }
    expect(economyRowProblemsOf(systemEconomyRowsOf(SEED, 1_000_000n))).toEqual([])
  })

  it('adds no stats.json row: no schedule row is the slice, and planet 40 stays at 69', () => {
    expect(scheduleFile.features.filter((row) => row.slice === 'solar-systems')).toEqual([])
    const p40 = scheduleFile.cumulative_by_planet.find((row) => row.planet === 40)
    expect(p40?.cumulative).toBe(P40_CUMULATIVE)
  })
})

describe('system economy row guards', () => {
  const [first, , , , hard] = systemEconomyRowsOf(SEED, 2n)

  it('refuses a value step off the usual p -> p + 1', () => {
    expect(economyRowProblemsOf(withRow(first, { valueStep: fromCanonical('5.0625') }))).toEqual([
      'planet 2.1: its values step off the usual p -> p + 1 step',
    ])
  })

  it('refuses an arrival step over the ceiling, and one felt under 0.9x', () => {
    expect(economyRowProblemsOf(withRow(first, { arrivalStep: fromCanonical('1.25') }))).toEqual([
      'planet 2.1: its ground steps over the hardness ceiling on arrival',
      'planet 2.1: its arrival step is felt under the felt speed floor',
    ])
    expect(economyRowProblemsOf(withRow(first, { arrivalStep: fromCanonical('1.21') }))).toEqual([
      'planet 2.1: its arrival step is felt under the felt speed floor',
    ])
  })

  it("refuses a hard start on a system's first planet", () => {
    expect(economyRowProblemsOf(withRow(first, { surface: 'hard' }))).toEqual([
      "planet 2.1: a hard start on a system's first planet stacks on the jump",
    ])
  })

  it('refuses a pool step under 1.15x once the planet before sold its gems at the 15% cap', () => {
    expect(economyRowProblemsOf(withRow(hard, { poolStep: fromCanonical('1.3') }))).toEqual([
      'planet 2.5: its pool steps under the R3 floor with the gems at their cap',
    ])
    expect(economyRowProblemsOf(withRow(hard, { poolStep: fromCanonical('1.36') }))).toEqual([])
  })

  it("refuses no gems, and a gem at its top band's tier", () => {
    expect(economyRowProblemsOf(withRow(hard, { gemSaleTiers: [] }))).toEqual([
      'planet 2.5: it sells no gems',
    ])
    expect(economyRowProblemsOf(withRow(hard, { gemSaleTiers: [32, 33, 35] }))).toEqual([
      "planet 2.5: a gem sells at or under its top band's tier",
    ])
  })
})
