import { describe, expect, it } from 'vitest'
import { FIRST_FUEL_TANK_LEVEL } from '../economy/fuelTank'
import {
  FUEL_TENDER_TABLE,
  fuelTenderLookOf,
  fuelTenderPartIds,
  fuelTenderTableProblemsOf,
  readFuelTenderTable,
  type FuelTenderTable,
} from './fuelTenderLook'

// The coal tender (ticket 758; the GD lock on #650): the fuel tank track shows on the rig as a
// wagon that steps with the tank's level and, above its top step, wears a finish a purchase with
// pips counting decades of capacity (the log tail of ticket 809), as a rig look does.

const TOP = FUEL_TENDER_TABLE.steps[FUEL_TENDER_TABLE.steps.length - 1]
const FINISHES = FUEL_TENDER_TABLE.tail.finishes

describe('fuel tender look (ticket 758)', () => {
  it('shows the coal cart on the starting tank, before any purchase', () => {
    expect(fuelTenderLookOf(FIRST_FUEL_TANK_LEVEL)).toMatchObject({
      partId: 'coal-cart',
      step: 0,
      tail: 0,
      tint: null,
      finish: null,
      pips: 0,
      glow: 0,
    })
  })

  it('changes the wagon on the first tank purchase and at each later step level', () => {
    const partsByLevel = [1, 2, 3, 4, 5, 6].map((level) => fuelTenderLookOf(level).partId)
    expect(partsByLevel).toEqual([
      'coal-cart',
      'bunker-tender',
      'riveted-tender',
      'riveted-tender',
      'guild-tender',
      'guild-tender',
    ])
    expect(fuelTenderLookOf(2).card).toBe('Bunker tender')
  })

  it('is a pure function of the level: every level from 1 to 10,000 answers, no two neighbours alike', () => {
    for (let level = 1; level < 10_000; level++) {
      const here = fuelTenderLookOf(level)
      const next = fuelTenderLookOf(level + 1)
      expect(here.partId).toBeTruthy()
      if (level >= TOP.fromLevel)
        expect(`${next.partId}${next.finish}`).not.toBe(`${here.partId}${here.finish}`)
    }
  })

  it('wears the top wagon in one finish per purchase above the top step, wrapping', () => {
    expect(fuelTenderLookOf(TOP.fromLevel).finish).toBeNull()
    expect(fuelTenderLookOf(TOP.fromLevel + 1)).toMatchObject({
      partId: TOP.part,
      tail: 1,
      tint: FINISHES[0].colour,
      finish: FINISHES[0].name,
      glow: FUEL_TENDER_TABLE.tail.glow,
    })
    const last = fuelTenderLookOf(TOP.fromLevel + FINISHES.length)
    expect(last.finish).toBe(FINISHES[FINISHES.length - 1].name)
    expect(fuelTenderLookOf(TOP.fromLevel + FINISHES.length + 1).finish).toBe(FINISHES[0].name)
  })

  it('counts decades of tank capacity as pips past the top step, 9 levels a decade', () => {
    expect([5, 6, 9, 10, 18, 19].map((level) => fuelTenderLookOf(level).pips)).toEqual([
      0, 0, 0, 1, 1, 2,
    ])
    expect(fuelTenderLookOf(1_000_000).pips).toBe(111_111)
  })

  it('never repeats a finish and pip count above the top step, up to a million levels', () => {
    const seen = new Set<string>()
    for (let level = TOP.fromLevel + 1; level <= 1_000_000; level++) {
      const { finish, pips } = fuelTenderLookOf(level)
      const shown = `${finish}:${pips}`
      expect(seen.has(shown)).toBe(false)
      seen.add(shown)
    }
  })

  it('keeps the tail glow under the rig body cap, so the drill nose stays the brightest part', () => {
    expect(FUEL_TENDER_TABLE.tail.glow).toBeLessThan(1)
  })

  it('lists the wagon parts in step order', () => {
    expect(fuelTenderPartIds()).toEqual([
      'coal-cart',
      'bunker-tender',
      'riveted-tender',
      'guild-tender',
    ])
  })
})

describe('fuel tender table checks', () => {
  const sound: FuelTenderTable = FUEL_TENDER_TABLE

  it('accepts the shipped table', () => {
    expect(fuelTenderTableProblemsOf(sound)).toEqual([])
  })

  it('refuses a first step past the starting tank, a step that does not rise and a repeated part', () => {
    const broken: FuelTenderTable = {
      ...sound,
      steps: [
        { fromLevel: 2, part: 'coal-cart', card: 'Coal cart' },
        { fromLevel: 2, part: 'coal-cart', card: 'Twin' },
      ],
    }
    expect(fuelTenderTableProblemsOf(broken)).toEqual([
      'steps: the first step is the starting tank, level 1',
      'step "coal-cart": part is listed twice',
      'step "coal-cart": fromLevel must rise',
    ])
  })

  it('refuses a finish that is not hex or 1 to 3 words, a glow at the cap and alike neighbours', () => {
    const finishes = [
      { name: 'Red', colour: '#ff0000' },
      { name: 'Very bright red paint', colour: 'red' },
      { name: 'Red', colour: '#ff0000' },
    ]
    const broken: FuelTenderTable = {
      ...sound,
      tail: { delta: 1, decadeStep: 3, finishes, glow: 1 },
    }
    expect(fuelTenderTableProblemsOf(broken)).toEqual([
      'tail.finishes: "red" is not #rrggbb',
      'tail.finishes: "Very bright red paint" is not 1 to 3 words',
      'tail.glow must lie between 0 and 1',
      'tail.finishes: "Red" repeats on neighbouring steps',
    ])
  })

  it('refuses a finish cycle too short for its decade, so finish and pips never repeat', () => {
    const short = { ...sound.tail, finishes: sound.tail.finishes.slice(0, 8) }
    expect(fuelTenderTableProblemsOf({ ...sound, tail: short })).toEqual([
      'tail.finishes must hold 9 to 12 finishes',
    ])
  })

  it('throws with every problem listed when the table is read broken', () => {
    const broken: FuelTenderTable = { ...sound, steps: [] }
    expect(() => readFuelTenderTable(broken)).toThrow(/steps: at least one step/)
  })
})
