import { describe, expect, it } from 'vitest'
import {
  CASING_FINISH_SLOTS,
  CASING_GRADE_LOOKS,
  CASING_PLATE_SLOTS,
  casingGradeLookOf,
  casingLookTableProblemsOf,
  casingTrimOf,
  firstGradeWithFullPips,
  readCasingLookTable,
  type CasingLookTable,
} from './casingGradeLook'
import { lumaOf, rgbOfHex } from './colour'
import file from './casingGradeLooks.json'

// CG2 (ticket 830), the GD lock on casing grades by depth: one plate metal per grade from five
// authored rows, a finish cycle past them and pips for the uncapped tail, keyed on the grade alone.

const TABLE = CASING_GRADE_LOOKS
const PLATES = TABLE.plates.length
const LAP = PLATES * TABLE.finishes.length

function soundTable(): CasingLookTable {
  return JSON.parse(JSON.stringify(file)) as CasingLookTable
}

describe('casing grade looks (ticket 830)', () => {
  it('ships five plate metals, brass first as the grade-1 lining of ticket 315', () => {
    expect(TABLE.plates.map((plate) => plate.id)).toEqual([
      'brass',
      'copper',
      'iron',
      'steel',
      'verdigris',
    ])
    expect(TABLE.plates[0].colour).toBe('#dcb35a')
  })

  it('walks the plates once per grade and wraps after the fifth', () => {
    expect([1, 2, 3, 4, 5, 6, 11].map((grade) => casingGradeLookOf(grade).plateIndex)).toEqual([
      0, 1, 2, 3, 4, 0, 0,
    ])
  })

  it('steps the finish once a lap of plates and cycles it, then counts the laps as pips', () => {
    expect(casingGradeLookOf(5).finishIndex).toBe(0)
    expect(casingGradeLookOf(6).finishIndex).toBe(1)
    expect(casingGradeLookOf(1 + LAP).finishIndex).toBe(0)
    expect(casingGradeLookOf(1 + LAP).pips).toBe(1)
    expect(casingGradeLookOf(LAP).pips).toBe(0)
  })

  it('never lets two neighbouring grades match, across every wrap of plates, finishes and pips', () => {
    const last = firstGradeWithFullPips() + 2 * LAP
    for (let grade = 1; grade < last; grade++) {
      const here = casingGradeLookOf(grade)
      const next = casingGradeLookOf(grade + 1)
      expect([here.plateIndex, here.finishIndex, here.drawnPips]).not.toEqual([
        next.plateIndex,
        next.finishIndex,
        next.drawnPips,
      ])
    }
  })

  it('answers any safe-integer grade with integer maths, holding the drawn pips to the most', () => {
    const million = casingGradeLookOf(1_000_000)
    expect(million.plateIndex).toBe((1_000_000 - 1) % PLATES)
    expect(million.pips).toBe(Math.floor((1_000_000 - 1) / LAP))
    expect(million.drawnPips).toBe(TABLE.pips.most)
    const largest = casingGradeLookOf(Number.MAX_SAFE_INTEGER)
    expect(Number.isInteger(largest.pips)).toBe(true)
    expect(largest.drawnPips).toBe(TABLE.pips.most)
  })

  it('refuses a grade below 1, a fraction and NaN: no lining draws a plate', () => {
    for (const grade of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => casingGradeLookOf(grade)).toThrow(RangeError)
    }
  })

  it('reads a lining type trim by id and falls back to the standard seam', () => {
    expect(casingTrimOf('refractory').style).toBe('firebrick')
    expect(casingTrimOf('standard').style).toBe('seam')
    expect(casingTrimOf('no-such-type')).toBe(TABLE.trims.standard)
  })

  it('keeps every plate above the luma every band rock reaches, so each stands a step from the rock', () => {
    // The darkest plate at the plain finish must still clear the brightest shaded rock by the
    // phone-size plate step (CASING_LINING_MIN_PLATE_LUMA_STEP); casingLiningLook.test.ts checks
    // the drawn pixels, this pins the rows that make it possible.
    const lumas = TABLE.plates.map((plate) => lumaOf(rgbOfHex(plate.colour)))
    expect(Math.min(...lumas)).toBeGreaterThanOrEqual(0.62)
  })

  it('refuses a broken table with every problem listed', () => {
    const broken = soundTable() as unknown as {
      plates: Record<string, unknown>[]
      finishes: Record<string, unknown>[]
      pips: Record<string, unknown>
      trims: Record<string, unknown>
    }
    broken.plates[1].pattern = 'rivet-line'
    broken.plates[2].colour = 'grey'
    broken.plates.pop()
    broken.finishes[1].lip = false
    broken.finishes[1].plateScale = 1
    broken.pips.most = 0
    delete broken.trims.standard
    const problems = casingLookTableProblemsOf(broken)
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('plates holds 4 rows'),
        expect.stringContaining('plate pattern "rivet-line" appears twice'),
        expect.stringContaining('plate 2 colour "grey"'),
        expect.stringContaining('finish look'),
        'pips.most is not 1 or more',
        'trims has no standard row',
      ]),
    )
    expect(() => readCasingLookTable(broken)).toThrow(/refused/)
  })

  it('fits the shader slots: five plates and at most four finishes', () => {
    expect(TABLE.plates).toHaveLength(CASING_PLATE_SLOTS)
    expect(TABLE.finishes.length).toBeLessThanOrEqual(CASING_FINISH_SLOTS)
    expect(casingLookTableProblemsOf(file)).toEqual([])
  })
})
