import { describe, expect, it } from 'vitest'
import { planetCardProblems, planetClassCardOf } from './planetCard'

const LINE = 'Magnetic. Ferrous veins throw fields; the probe reads them.'

describe('planet card', () => {
  it('tags a magnetic planet "Magnetic" with its arrival line in the ledger voice', () => {
    expect(planetClassCardOf(25)).toEqual({
      planetClass: 'magnetic',
      tag: 'Magnetic',
      arrivalLine: LINE,
    })
  })

  it('tags every magnetic planet the same, endless P43 included, and P30 (relic) not', () => {
    const tagged = [24, 25, 29, 30, 31, 32, 33, 43, 48].filter((p) => planetClassCardOf(p))
    expect(tagged).toEqual([25, 29, 31, 32, 43, 48])
    expect(planetClassCardOf(30)).toBeNull()
  })

  it('shows no class on a planet without one, or of a class with no card yet', () => {
    expect(planetClassCardOf(1)).toBeNull()
    expect(planetClassCardOf(17)).toBeNull()
  })

  it('refuses card data naming no class or missing its text, whole', () => {
    const problems = planetCardProblems({
      byClass: { molten: { tag: 'Molten', arrivalLine: 'Hot.' }, frozen: { tag: 'Frozen' } },
    })
    expect(problems).toEqual([
      'byClass names "molten", which is no planet class',
      'byClass.frozen needs a tag and an arrivalLine',
    ])
  })
})
