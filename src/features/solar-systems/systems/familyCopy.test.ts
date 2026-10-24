import { describe, expect, it } from 'vitest'
import { TOOLTIP_LINE_WORDS_MAX, TOOLTIP_LINES_MAX } from '../../../constants/uiParts'
import { isAttachId } from '../../../systems/registries/vehicleAttach'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import { CARD_LINE_CHARACTERS } from '../../ores'
import paletteFile from '../palette.json'
import { familyCopyFor, filledCopyOf, slotCopyOf } from './familyCopy'
import { familyRowProblems, NAME_WORDS_MAX, TAG_CHARACTERS_MAX } from './familyGuards'
import { ARCHETYPE_PALETTE } from './paletteRows'
import { systemRosterOf } from './systemRoster'

// The SS2-B copy templates (ticket 780): names of four words or fewer, a tag and an arrival line
// shaped as the planet card's hazard read, hover lines inside the tooltip budget, all fitting the
// 360 px card once the longest planet name is filled in.

const SEED = 20261024
const FAMILIES = ARCHETYPE_PALETTE.newContent.families
const LONGEST_NAME = 'Wwwwwwwww Wwwwwww 999'
const BUDGET = { longestName: LONGEST_NAME, longestFolio: '999' }
const [FIRST_RAW] = paletteFile.newContentSlots.families

type Raw = Record<string, unknown>

function problemsOf(change: Raw): string[] {
  return familyRowProblems({ ...FIRST_RAW, ...change }, 'family', BUDGET)
}

describe('family copy', () => {
  it('names every family and its rig part in four words or fewer, within the display budget', () => {
    for (const family of FAMILIES) {
      expect(wordCountOf(family.name)).toBeLessThanOrEqual(NAME_WORDS_MAX)
      expect(family.name.length).toBeLessThanOrEqual(ARCHETYPE_PALETTE.names.charactersMax)
      expect(wordCountOf(family.rigPart.name)).toBeLessThanOrEqual(NAME_WORDS_MAX)
      expect(isAttachId(family.rigPart.attach)).toBe(true)
    }
    expect(new Set(FAMILIES.map((family) => family.rigPart.name)).size).toBe(FAMILIES.length)
  })

  it('opens each arrival line with a one- or two-word tag and keeps it to two card lines, no digits', () => {
    for (const { copy } of FAMILIES) {
      expect(copy.tag.length).toBeLessThanOrEqual(TAG_CHARACTERS_MAX)
      expect(copy.tag.split(' ').length).toBeLessThanOrEqual(2)
      expect(copy.arrivalLine.startsWith(`${copy.tag}. `)).toBe(true)
      expect(copy.arrivalLine.endsWith('.')).toBe(true)
      expect(copy.arrivalLine).not.toMatch(/\d/)
      const filled = filledCopyOf(copy.arrivalLine, { planet: LONGEST_NAME, g: '999' })
      expect(filled.length).toBeLessThanOrEqual(CARD_LINE_CHARACTERS)
    }
  })

  it('keeps every hover line to the tooltip budget with the longest planet name filled in', () => {
    for (const { copy } of FAMILIES) {
      expect(copy.hoverLines.length).toBeLessThanOrEqual(TOOLTIP_LINES_MAX)
      for (const line of copy.hoverLines) {
        const filled = filledCopyOf(line, { planet: LONGEST_NAME, g: '999' })
        expect(wordCountOf(filled)).toBeLessThanOrEqual(TOOLTIP_LINE_WORDS_MAX)
        expect(filled.length).toBeLessThanOrEqual(CARD_LINE_CHARACTERS)
      }
    }
  })

  it("fills a planet's slot copy with its name and folio, and answers null for an empty slot", () => {
    for (const planet of systemRosterOf(SEED, 2n)) {
      const copy = slotCopyOf(planet)
      expect(copy?.familyId).toBe(planet.slot?.id)
      expect(copy?.rigPart).toEqual(planet.slot?.rigPart)
      for (const line of [copy?.arrivalLine ?? '', ...(copy?.hoverLines ?? [])]) {
        expect(line).not.toContain('{')
      }
      expect(copy?.hoverLines.some((line) => line.includes(planet.name))).toBe(true)
    }
    expect(slotCopyOf(systemRosterOf(SEED, 3n)[0])).toBeNull()
  })

  it('fills {planet} and {g} as written, leaving a template without a slot as it is', () => {
    const fill = { planet: 'Ember Reach 8', g: '8' }
    expect(filledCopyOf('Folio {g}: {planet} pays.', fill)).toBe('Folio 8: Ember Reach 8 pays.')
    expect(filledCopyOf('No slot.', fill)).toBe('No slot.')
    const copy = familyCopyFor(FAMILIES[0], fill)
    expect(copy.hoverLines[0]).toBe('The vents of Ember Reach 8 breathe before they fire.')
  })

  it('refuses a long name, a long tag, a line that outgrows the card when filled and a stray field', () => {
    expect(problemsOf({ name: 'A Flare Of Five Words' })).toEqual(['family.name is over 4 words'])
    expect(problemsOf({ name: 'W'.repeat(LONGEST_NAME.length + 1) })).toEqual([
      `family.name is over ${LONGEST_NAME.length} characters, the display budget`,
    ])
    const copy = {
      tag: 'Ferro-sand sinks',
      arrivalLine: 'Vent flares. Burns at folio {g} {planet} {planet} {planet}; wait the beat',
      hoverLines: ['one', 'two.', 'three.', 'four.'],
    }
    expect(problemsOf({ copy })).toEqual([
      'family.copy.tag must be one or two capitalised words, 12 characters at most',
      'family.copy.arrivalLine must open with "Ferro-sand sinks. " and end with a full stop',
      'family.copy.arrivalLine is 112 characters filled, over 64, the 360 px card',
      'family.copy.hoverLines has 4 lines, over 3',
      'family.copy.hoverLines[0] must be a sentence',
    ])
    expect(problemsOf({ hidden: true })).toEqual(['family.hidden is not a family field'])
  })

  it('refuses a rig part off the vehicle, a wordy part and a behaviour without its column', () => {
    expect(
      problemsOf({ rigPart: { name: 'A long name for a part', attach: 'hull.nowhere' } }),
    ).toEqual([
      'family.rigPart.name must name the part in at most 4 words',
      'family.rigPart.attach must be a vehicle attach point',
    ])
    expect(
      problemsOf({ behaviour: { effect: 'Stall', summary: '', never: [{ effect: 'bite' }] } }),
    ).toEqual([
      'family.behaviour.effect must be a snake_case effect',
      'family.behaviour.summary must say what the family does',
      'family.behaviour.telegraphed must be true or false',
      'family.behaviour.never[0].of must name the first-system id that has it',
    ])
  })
})
