import { describe, expect, it } from 'vitest'
import { TITLE_WORDS_MAX, ONE_LINE_WORDS_MAX } from '../../constants/uiParts'
import { withRegistrations } from '../../registries/registrar'
import { offsetStartSlice } from '../registries/casingOffsetFixtures'
import { planetDisplayNameOf } from '../registries/planetRow'
import { planetGravityTraitOf } from './localGravityReading'
import { TRAVEL_CARD_FACT_IDS } from './travelCardIds'
import { travelCardViewOf } from './travelCardView'

const HOP = { fromPlanet: 1, toPlanet: 2, seconds: 10 }

const wordsOf = (text: string) => text.split(/\s+/).length

describe('travel card view (ticket 885)', () => {
  it('names the destination and its gravity as facts, the gravity through the formatter', () => {
    const { facts } = travelCardViewOf(HOP)
    const gravity = planetGravityTraitOf(2)
    expect(facts).toEqual([
      expect.objectContaining({
        text: planetDisplayNameOf(2),
        testId: TRAVEL_CARD_FACT_IDS.destination,
      }),
      expect.objectContaining({
        text: gravity.text,
        exact: gravity.exact,
        testId: TRAVEL_CARD_FACT_IDS.gravity,
      }),
    ])
  })

  it('gives each fact a glyph', () => {
    expect(travelCardViewOf(HOP).facts.every((fact) => fact.iconId.startsWith('icon-'))).toBe(true)
  })

  it('keeps the planets by name in the tooltip, with no bare planet number on the card', () => {
    const view = travelCardViewOf(HOP)
    expect(view.heading.tooltipLines).toEqual([
      `Leaving ${planetDisplayNameOf(1)} for ${planetDisplayNameOf(2)}.`,
    ])
    expect(`${view.title} ${view.heading.oneLine}`).not.toMatch(/\d/)
  })

  it('keeps the title and the one line within the copy budget', () => {
    const view = travelCardViewOf(HOP)
    expect(wordsOf(view.title)).toBeLessThanOrEqual(TITLE_WORDS_MAX)
    expect(wordsOf(view.heading.oneLine)).toBeLessThanOrEqual(ONE_LINE_WORDS_MAX)
  })

  it('keeps the title the jump specs wait on', () => {
    expect(travelCardViewOf(HOP).title).toBe('Core drive engaged')
  })

  // Ticket 829 (Progression): the planet card shows an offset start, so the dock's buy is known.
  it("names an offset start's casing grade as a fact, and none on the ladder's default", () => {
    const toThree = { fromPlanet: 2, toPlanet: 3, seconds: 10 }
    const casingFactsOf = () =>
      travelCardViewOf(toThree).facts.filter(
        ({ testId }) => testId === TRAVEL_CARD_FACT_IDS.casingStart,
      )
    expect(casingFactsOf()).toEqual([])
    expect(withRegistrations([offsetStartSlice(3, 1n)], casingFactsOf)).toEqual([
      expect.objectContaining({ text: 'Starts at casing grade 10', iconId: 'icon-casing' }),
    ])
  })
})
