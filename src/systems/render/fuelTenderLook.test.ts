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
// wagon that steps with the tank's level and tints on above its top step, as a rig look does.

const TOP = FUEL_TENDER_TABLE.steps[FUEL_TENDER_TABLE.steps.length - 1]
const PALETTE = FUEL_TENDER_TABLE.tail.palette

describe('fuel tender look (ticket 758)', () => {
  it('shows the coal cart on the starting tank, before any purchase', () => {
    expect(fuelTenderLookOf(FIRST_FUEL_TANK_LEVEL)).toMatchObject({
      partId: 'coal-cart',
      step: 0,
      tail: 0,
      tint: null,
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
        expect(`${next.partId}${next.tint}`).not.toBe(`${here.partId}${here.tint}`)
    }
  })

  it('tints the top wagon on one palette step per purchase above the top step, wrapping', () => {
    expect(fuelTenderLookOf(TOP.fromLevel).tint).toBeNull()
    expect(fuelTenderLookOf(TOP.fromLevel + 1)).toMatchObject({
      partId: TOP.part,
      tail: 1,
      tint: PALETTE[0],
      glow: FUEL_TENDER_TABLE.tail.glow,
    })
    expect(fuelTenderLookOf(TOP.fromLevel + PALETTE.length).tint).toBe(PALETTE[PALETTE.length - 1])
    expect(fuelTenderLookOf(TOP.fromLevel + PALETTE.length + 1).tint).toBe(PALETTE[0])
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

  it('refuses a palette outside 2 to 8 colours, a colour that is not hex, a glow at the cap and alike neighbours', () => {
    const broken: FuelTenderTable = {
      ...sound,
      tail: { delta: 1, palette: ['#ff0000', 'red', '#ff0000'], glow: 1 },
    }
    expect(fuelTenderTableProblemsOf(broken)).toEqual([
      'tail.palette: "red" is not #rrggbb',
      'tail.glow must lie between 0 and 1',
      'tail.palette: "#ff0000" repeats on neighbouring steps',
    ])
    expect(
      fuelTenderTableProblemsOf({ ...sound, tail: { ...sound.tail, palette: ['#ff0000'] } }),
    ).toEqual(['tail.palette must hold 2 to 8 colours'])
  })

  it('throws with every problem listed when the table is read broken', () => {
    const broken: FuelTenderTable = { ...sound, steps: [] }
    expect(() => readFuelTenderTable(broken)).toThrow(/steps: at least one step/)
  })
})
