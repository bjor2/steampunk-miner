import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { rigLookPlaqueFactOf } from './rigLooks'
import { tailGradeTextOf } from './rigLookPlaque'
import { RIG_LOOK_TABLE } from './rigLookTable'
import { rigLookTableProblemsOf, type RigLookTable } from './rigLookTableChecks'

/** Progression's hull names (#157 comment 6300549964) at Systems' thresholds (6300543785). */
const HULL_STEPS = [
  [20, 'Riveted plate'],
  [80, 'Banded iron'],
  [140, 'Brass-trimmed armour'],
  [260, 'Layered armour'],
  [440, 'Filigree armour'],
] as const

/** The widest plaque fact a 360 px plaque wraps onto its own line (Content's 4-word names). */
const PHONE_FACT_CHARS_MAX = 44

function tableWithHullPlaque(step: string, tail: string): RigLookTable {
  const tracks = RIG_LOOK_TABLE.tracks.map((rows) =>
    rows.track === 'hull' ? { ...rows, plaque: { step, tail } } : rows,
  )
  return { ...RIG_LOOK_TABLE, tracks }
}

describe('rig look plaque fact (ticket 585)', () => {
  it('names nothing below the first hull step, so no unowned step is named', () => {
    expect(rigLookPlaqueFactOf('hull', 0)).toBeNull()
    expect(rigLookPlaqueFactOf('hull', 19)).toBeNull()
  })

  it.each(HULL_STEPS)('names the owned hull step from %i purchases: %s', (from, name) => {
    expect(rigLookPlaqueFactOf('hull', from)).toBe(`Fitting: ${name}`)
  })

  it('names the step owned, never the next one, on the last purchase before a step', () => {
    expect(rigLookPlaqueFactOf('hull', 79)).toBe('Fitting: Riveted plate')
    expect(rigLookPlaqueFactOf('hull', 439)).toBe('Fitting: Layered armour')
  })

  it('shows no grade on the top step itself, then Grade 1, 2, 3 above it', () => {
    expect(rigLookPlaqueFactOf('hull', 440)).toBe('Fitting: Filigree armour')
    expect(rigLookPlaqueFactOf('hull', 441)).toBe('Fitting: Filigree armour · Grade 1')
    expect(rigLookPlaqueFactOf('hull', 442)).toBe('Fitting: Filigree armour · Grade 2')
    expect(rigLookPlaqueFactOf('hull', 443)).toBe('Fitting: Filigree armour · Grade 3')
  })

  it('names the twin-drum boiler from 16 and grades its tail', () => {
    expect(rigLookPlaqueFactOf('boiler', 15)).toBeNull()
    expect(rigLookPlaqueFactOf('boiler', 16)).toBe('Fitting: Twin-drum boiler')
    expect(rigLookPlaqueFactOf('boiler', 17)).toBe('Fitting: Twin-drum boiler · Grade 1')
  })

  it('keeps every track without a plaque template off the plaque', () => {
    const plain = UPGRADE_IDS.filter((track) => track !== 'hull' && track !== 'boiler')
    for (const track of plain) {
      for (const n of [0, 1, 100, 1_000, 1_000_000])
        expect(rigLookPlaqueFactOf(track, n)).toBeNull()
    }
  })

  it('keeps grading past the look’s lap, uncapped', () => {
    expect(rigLookPlaqueFactOf('hull', 440 + 101)).toBe('Fitting: Filigree armour · Grade 101')
    expect(rigLookPlaqueFactOf('hull', 440 + 9_999)).toBe('Fitting: Filigree armour · Grade 9999')
    expect(rigLookPlaqueFactOf('hull', 440 + 1_000_000)).toBe('Fitting: Filigree armour · Grade 1M')
  })

  it('fits the widest hull fact at grades 1, 101, 9999 and 1e6 on a 360 px plaque', () => {
    for (const grade of [1, 101, 9_999, 1_000_000]) {
      const fact = rigLookPlaqueFactOf('hull', 440 + grade)!
      expect(fact.length, fact).toBeLessThanOrEqual(PHONE_FACT_CHARS_MAX)
    }
    const widest = HULL_STEPS.map(([, name]) => `Fitting: ${name} · Grade 9999`)
    for (const fact of widest) expect(fact.length, fact).toBeLessThanOrEqual(PHONE_FACT_CHARS_MAX)
  })
})

describe('rig look tail grade text', () => {
  it.each([
    [1, '1'],
    [101, '101'],
    [9_999, '9999'],
    [10_000, '10k'],
    [12_345, '12.3k'],
    [999_999, '999.9k'],
    [1_000_000, '1M'],
    [12_399_999, '12.3M'],
    [2_147_483_647, '2.1B'],
  ])('shows grade %i as %s', (grade, text) => {
    expect(tailGradeTextOf(grade)).toBe(text)
  })

  it('never writes a float, an exponent or more than six characters', () => {
    for (let grade = 1; grade < 2_147_483_647; grade = grade * 3 + 1) {
      expect(tailGradeTextOf(grade)).toMatch(/^\d{1,4}$|^\d{1,3}(\.\d)?[kMB]$/)
    }
  })
})

describe('rig look plaque template checks', () => {
  it('loads the shipped hull and boiler templates', () => {
    expect(rigLookTableProblemsOf(RIG_LOOK_TABLE, UPGRADE_IDS)).toEqual([])
  })

  it('refuses a step template without the step name, or one that shows a grade', () => {
    const table = tableWithHullPlaque('Fitting', 'Fitting: {stepName} · Grade {grade}')
    expect(rigLookTableProblemsOf(table, UPGRADE_IDS)).toEqual([
      'hull: plaque step needs {stepName} once',
    ])
    const graded = tableWithHullPlaque('{stepName} {grade}', 'Fitting: {stepName} · Grade {grade}')
    expect(rigLookTableProblemsOf(graded, UPGRADE_IDS)).toEqual([
      'hull: plaque step may not show {grade}',
    ])
  })

  it('refuses a tail template without the grade', () => {
    const table = tableWithHullPlaque('Fitting: {stepName}', 'Fitting: {stepName}')
    expect(rigLookTableProblemsOf(table, UPGRADE_IDS)).toEqual([
      'hull: plaque tail needs {grade} once',
    ])
  })

  it('refuses a template on a track whose steps carry no card', () => {
    const tracks = RIG_LOOK_TABLE.tracks.map((rows) =>
      rows.track === 'drill_power'
        ? { ...rows, plaque: { step: '{stepName}', tail: '{stepName} {grade}' } }
        : rows,
    )
    const problems = rigLookTableProblemsOf({ ...RIG_LOOK_TABLE, tracks }, UPGRADE_IDS)
    expect(problems).toContain('drill_power: step from 5: no card for the plaque')
  })
})
