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
// pips counting decades of capacity (the log tail of ticket 809), as a rig look does. LK5 (ticket
// 813) adds three authored steps after the guild tender, one per purchase, so the line has at
// least the five authored steps the GD lock of 24 Oct asks of every line; the tender is exempt
// from the decade rule and keeps one step per purchase.

const TOP = FUEL_TENDER_TABLE.steps[FUEL_TENDER_TABLE.steps.length - 1]
const FINISHES = FUEL_TENDER_TABLE.tail.finishes

/** The ladder as authored: the #758 wagons at 1, 2, 3 and 5, then the LK5 parts at 6, 7 and 8. */
const AUTHORED_STEPS = [
  { fromLevel: 1, part: 'coal-cart', card: 'Coal cart' },
  { fromLevel: 2, part: 'bunker-tender', card: 'Bunker tender' },
  { fromLevel: 3, part: 'riveted-tender', card: 'Riveted tender' },
  { fromLevel: 5, part: 'guild-tender', card: 'Guild tender' },
  { fromLevel: 6, part: 'twin-tank-tender', card: 'Second tank' },
  { fromLevel: 7, part: 'hopper-tender', card: 'Coal hopper' },
  { fromLevel: 8, part: 'glass-tank-tender', card: 'Sight glass tank' },
]
const AUTHORED_STEPS_MIN = 5

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
    const partsByLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => fuelTenderLookOf(level).partId)
    expect(partsByLevel).toEqual([
      'coal-cart',
      'bunker-tender',
      'riveted-tender',
      'riveted-tender',
      'guild-tender',
      'twin-tank-tender',
      'hopper-tender',
      'glass-tank-tender',
      'glass-tank-tender',
    ])
    expect(fuelTenderLookOf(2).card).toBe('Bunker tender')
  })

  it('has at least five authored steps, the #758 wagons first and the LK5 parts after them (ticket 813)', () => {
    expect(FUEL_TENDER_TABLE.steps).toEqual(AUTHORED_STEPS)
    expect(FUEL_TENDER_TABLE.steps.length).toBeGreaterThanOrEqual(AUTHORED_STEPS_MIN)
  })

  it.each(AUTHORED_STEPS.slice(1))(
    'shows $part from level $fromLevel, named $card, and holds it to the next step',
    ({ fromLevel, part, card }) => {
      const next = AUTHORED_STEPS.find((step) => step.fromLevel > fromLevel)
      const before = fuelTenderLookOf(fromLevel - 1)
      expect(before.partId).not.toBe(part)
      for (let level = fromLevel; level < (next?.fromLevel ?? fromLevel + 1); level++) {
        expect(fuelTenderLookOf(level)).toMatchObject({ partId: part, card, tail: 0, tint: null })
      }
    },
  )

  it('is exempt from the decade rule: every LK5 step is one purchase after the one before', () => {
    const added = FUEL_TENDER_TABLE.steps.filter((step) => step.fromLevel > 5)
    expect(added.map((step) => step.fromLevel)).toEqual([6, 7, 8])
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
    expect(fuelTenderPartIds()).toEqual(AUTHORED_STEPS.map((step) => step.part))
  })

  it('names every step in 3 words or fewer, the hover line band names (Progression)', () => {
    for (const step of FUEL_TENDER_TABLE.steps) {
      expect(step.card.trim().split(/\s+/).length).toBeLessThanOrEqual(3)
    }
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
