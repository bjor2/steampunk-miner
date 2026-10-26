import { describe, expect, it } from 'vitest'
import { fromCanonical, fromSafeInteger, mul } from '../money'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  bottomCasingGrade,
  casingBiomeDeltaOf,
  casingHardness,
  casingLadderOf,
  gnawedCasingGrade,
  GNAWED_GRADE_FLOOR,
  isCasingGradeEnough,
  requiredCasingGrade,
  requiredGradeOnLadder,
} from './casingGrades'
import { ECONOMY } from './economy'
import { blockHardness } from './oreEconomy'

const CORE = ECONOMY.ore.coreTierBand
const BANDS = [1, 2, 3, 4, 5, CORE]

function gradesOfPlanet(planetIndex: number): bigint[] {
  return BANDS.map((band) => requiredCasingGrade({ planetIndex, band }))
}

describe('casing grades by depth (ticket 829)', () => {
  it('keeps planet 1 byte for byte with #41: grade b for band b and grade 5 for the core', () => {
    expect(gradesOfPlanet(1)).toEqual([1n, 2n, 3n, 4n, 5n, 5n])
  })

  it('asks q_surface(g) + b on planet g, four grades a planet with the core clamped to band 5', () => {
    expect(gradesOfPlanet(2)).toEqual([5n, 6n, 7n, 8n, 9n, 9n])
    expect(gradesOfPlanet(6)).toEqual([21n, 22n, 23n, 24n, 25n, 25n])
    expect(gradesOfPlanet(1_000_000)).toEqual([
      3_999_997n,
      3_999_998n,
      3_999_999n,
      4_000_000n,
      4_000_001n,
      4_000_001n,
    ])
  })

  it('reads the grades a planet adds from data, not code', () => {
    expect(ECONOMY.casing.gradesPerPlanet).toBe(4)
    expect(casingLadderOf(10).surfaceGrade).toBe(
      BigInt(ECONOMY.casing.casingGradeStart + ECONOMY.casing.gradesPerPlanet * 9),
    )
  })

  // The VS's arrival assert: a rig cased to the bottom of P(g) holds the surface of P(g + 1).
  it.each([1, 5, 6, 1_000_000])(
    'holds the surface of planet %i + 1 with the bottom grade of planet %i',
    (g) => {
      expect(isCasingGradeEnough(bottomCasingGrade(g), { planetIndex: g + 1, band: 1 })).toBe(true)
      expect(isCasingGradeEnough(bottomCasingGrade(g) - 1n, { planetIndex: g + 1, band: 1 })).toBe(
        false,
      )
    },
  )

  it('ships no biome that asks more: every act row adds 0', () => {
    expect(ECONOMY.archetypes.map((act) => act.casingBiomeDelta)).toEqual([0])
    expect([1, 8, 12, 16, 17, 40].map(casingBiomeDeltaOf)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('adds a +1 biome to every band but the surface one, so arrival never bursts', () => {
    const plus = { surfaceGrade: 21n, biomeDelta: 1 }
    expect(BANDS.map((band) => requiredGradeOnLadder(plus, band))).toEqual([
      21n,
      23n,
      24n,
      25n,
      26n,
      26n,
    ])
  })
})

describe('casing grades: lining hardness and lift energy', () => {
  it('records the informational lift multiplier', () => {
    expect(ECONOMY.energy.drillUpEnergyMult).toEqual(fromCanonical('2.5'))
  })

  it('makes lining as hard as the band its grade holds on the current planet', () => {
    expect(casingHardness(1, 3n)).toEqual(blockHardness(1, 3))
    expect(casingHardness(2, 9n)).toEqual(blockHardness(2, 5))
    expect(casingHardness(2, 5n)).toEqual(blockHardness(2, 1))
  })

  it('reads a grade under the planet surface as its band-1 rock', () => {
    expect(casingHardness(3, 1n)).toEqual(blockHardness(3, 1))
  })

  it('records drillUpEnergyMult as what lift + drill already drain: thrust plus drill rates', () => {
    const { drill, thrust } = ENERGY_QUANTA_PER_TICK
    expect(fromSafeInteger(drill + thrust)).toEqual(
      mul(ECONOMY.energy.drillUpEnergyMult, fromSafeInteger(drill)),
    )
  })

  it('refuses a grade below 1', () => {
    expect(() => casingHardness(1, 0n)).toThrow(RangeError)
  })
})

describe('casing grades: the gnaw floor (#676, TD pin)', () => {
  it('keeps gnawMaxDrop in data as one whole number of grades, 1 by the ruling', () => {
    expect(ECONOMY.casing.gnawMaxDrop).toBe(1)
    expect(GNAWED_GRADE_FLOOR).toBe(1n)
  })

  it('reads a gnawed wall of native grade 1, 3 and 5 with gnawMaxDrop 1 one grade lower, floored at 1', () => {
    expect([1n, 3n, 5n].map((native) => gnawedCasingGrade(native, 1, 1))).toEqual([1n, 2n, 4n])
  })

  it('reads a gnawed wall of native grade 1, 3 and 5 with gnawMaxDrop 0 at its native grade', () => {
    expect([1n, 3n, 5n].map((native) => gnawedCasingGrade(native, 1, 0))).toEqual([1n, 3n, 5n])
  })

  it('takes the data gnawMaxDrop when none is given', () => {
    expect(gnawedCasingGrade(3n, 1)).toBe(gnawedCasingGrade(3n, 1, ECONOMY.casing.gnawMaxDrop))
  })

  it('reads a gnawed wall on planet 10 one grade under its native ladder grade', () => {
    expect(gnawedCasingGrade(requiredCasingGrade({ planetIndex: 10, band: 3 }), 1)).toBe(38n)
  })

  it('never reads a gnawed wall below grade 1, nor more than gnawMaxDrop below its native grade', () => {
    for (let native = 1n; native <= 6n; native++) {
      for (let gnaws = 0; gnaws <= 4; gnaws++) {
        for (let maxDrop = 0; maxDrop <= 3; maxDrop++) {
          const grade = gnawedCasingGrade(native, gnaws, maxDrop)
          expect(grade >= 1n).toBe(true)
          expect(grade >= native - BigInt(maxDrop)).toBe(true)
          expect(grade <= native).toBe(true)
        }
      }
    }
  })
})
