import { describe, expect, it } from 'vitest'
import { flavourProblemsOf } from './flavourRules'

describe('flavour copy rules', () => {
  it('passes one plain sentence that ends in a full stop', () => {
    expect(
      flavourProblemsOf('Wider bins and stouter rivets, so you haul more ore per trip.'),
    ).toEqual([])
  })

  it('refuses a digit anywhere in the line', () => {
    expect(flavourProblemsOf('Glows within 16 m of the miner.')).toHaveLength(1)
  })

  it('refuses a line over eighty characters', () => {
    const long = `${'Brass '.repeat(14)}gears.`
    expect(flavourProblemsOf(long)).toEqual([`is ${long.length} characters, over 80`])
  })

  it('refuses a line without a final full stop', () => {
    expect(flavourProblemsOf('A harder-tempered bit')).toEqual(['does not end in a full stop'])
  })

  it('refuses two sentences', () => {
    expect(flavourProblemsOf('Brass bites. Rock gives.')).toEqual(['is more than one sentence'])
  })

  it('refuses each banned word in any case, as a whole word', () => {
    expect(flavourProblemsOf('The Best rig for magic spells, the ultimate one.')).toHaveLength(5)
  })

  it('lets words that only contain a banned word pass', () => {
    expect(flavourProblemsOf('A rigid frame bestows a spellbound trigger.')).toEqual([])
  })

  it('refuses the plural of a banned word', () => {
    expect(flavourProblemsOf('Two rigs share a pad.')).toEqual(['uses the banned word "rig"'])
  })
})
