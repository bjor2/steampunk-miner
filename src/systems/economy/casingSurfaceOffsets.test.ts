import { describe, expect, it } from 'vitest'
import { fromCanonical, mul } from '../money'
import { casingSurfaceGradeOf, defaultCasingSurfaceGrade } from '../registries/planetRow'
import { casingCatchUpPrice } from './casingPrices'
import { casingSurfaceOffsetProblemsOf, type SurfaceGradeRow } from './casingSurfaceOffsets'
import { ECONOMY } from './economy'

/** Planet `planetIndex` with its surface `lead` grades over the ladder's default. */
function offsetRow(planetIndex: number, lead: bigint): SurfaceGradeRow {
  return { planetIndex, casingSurfaceGrade: defaultCasingSurfaceGrade(planetIndex) + lead }
}

/** A measured wallet on planet 3 that pays the +1 catch-up (2022) within 8%. */
const RICH_P3 = [{ planet: 3, money: fromCanonical('30000') }]

describe('casing offset starts (ticket 829)', () => {
  it('accepts a +1 surface on a system planet that is not its first, paid within 8% of money held', () => {
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, 1n)], RICH_P3)).toEqual([])
  })

  it('refuses a +2 surface: the GD re-lock caps offsets at +1', () => {
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, 2n)], RICH_P3)).toContain(
      'planet 3 sets its surface grade +2 over the default',
    )
  })

  it("refuses an offset on a system's first planet", () => {
    const firstOfSystem2 = ECONOMY.starMap.planetsPerSystem + 1
    expect(
      casingSurfaceOffsetProblemsOf([offsetRow(1, 1n), offsetRow(firstOfSystem2, 1n)]),
    ).toEqual(
      expect.arrayContaining([
        "planet 1 is its system's first and takes no offset",
        `planet ${firstOfSystem2} is its system's first and takes no offset`,
      ]),
    )
  })

  it('refuses a second offset planet in one system', () => {
    const measured = [...RICH_P3, { planet: 4, money: fromCanonical('1e6') }]
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, 1n), offsetRow(4, 1n)], measured)).toEqual([
      'system 1 has more than one offset planet',
    ])
  })

  it('refuses a catch-up over 8% of the money held after the fuel fee', () => {
    const catchUp = casingCatchUpPrice(9n, 10n)
    const tooPoor = [{ planet: 3, money: mul(catchUp, fromCanonical('12')) }]
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, 1n)], tooPoor)).toEqual([
      "planet 3's catch-up costs more than the share of money held allows",
    ])
  })

  it('refuses an offset on a planet whose money held was never measured', () => {
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, 1n)], [])).toEqual([
      'planet 3 has no measured money held',
    ])
  })

  it('refuses a surface under the default', () => {
    expect(casingSurfaceOffsetProblemsOf([offsetRow(3, -1n)], RICH_P3)).toContain(
      'planet 3 sets its surface grade under the default',
    )
  })

  it('ships no offset: every shipped planet row keeps the default surface grade', () => {
    const rows = Array.from({ length: 60 }, (_, at) => ({
      planetIndex: at + 1,
      casingSurfaceGrade: casingSurfaceGradeOf(at + 1),
    }))
    expect(casingSurfaceOffsetProblemsOf(rows)).toEqual([])
    expect(
      rows.every((row) => row.casingSurfaceGrade === defaultCasingSurfaceGrade(row.planetIndex)),
    ).toBe(true)
  })
})
