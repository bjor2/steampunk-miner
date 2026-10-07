import { describe, expect, it } from 'vitest'
import { oreFamilies } from '../../ores'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { familyRows } from './familyRows'
import { mixSeedOf } from './oreMix'
import { accentPoolOf, actOf, familiesOfAct, gateClassOf, planetMixPlanOf } from './planetActs'
import { THEME_ROWS } from './themeRows'

const PLANETS = Array.from({ length: 200 }, (_, at) => at + 1)
const MIXED_PLANETS = PLANETS.filter((planet) => planet >= 3)
const SEEDS = [83921, 31415, 27182]

/** The plan under the hook's own seed for the planet of world `worldSeed`, as generation reads it. */
function planOnWorld(planet: number, worldSeed: number) {
  return planetMixPlanOf(planet, mixSeedOf(planetParamsFor(worldSeed, planet)))
}

describe('planet acts', () => {
  it('follows the campaign acts, P1 legacy, then Fire, Frost, Lodestone and Hollow', () => {
    const at = (planets: number[]) => planets.map((planet) => actOf(planet).id)
    expect(at([1, 2, 7])).toEqual(['foothold.base', 'foothold.heavy', 'foothold.heavy'])
    expect(at([8, 16, 17, 24])).toEqual(['fire', 'fire', 'frost', 'frost'])
    expect(at([25, 32, 33, 40])).toEqual(['lodestone', 'lodestone', 'hollow', 'hollow'])
  })

  it('cycles fire, frost, lodestone, hollow and foothold.heavy from P41 by (p - 41) mod 5', () => {
    const cycle = ['fire', 'frost', 'lodestone', 'hollow', 'foothold.heavy']
    for (let planet = 41; planet <= 200; planet++) {
      expect(actOf(planet).id).toBe(cycle[(planet - 41) % 5])
    }
  })

  it('never repeats an act back to back, P40 to P41 included', () => {
    const changes = PLANETS.filter((planet) => planet >= 41)
    for (const planet of changes) expect(actOf(planet).id).not.toBe(actOf(planet - 1).id)
  })

  it("gives every act's two commons and rare three different gate classes", () => {
    for (const act of THEME_ROWS.acts.filter((candidate) => candidate.commons !== null)) {
      const classes = [...(act.commons ?? []), act.rare ?? ''].map((family) => gateClassOf(family))
      expect(new Set(classes).size).toBe(3)
    }
  })

  it('picks an accent of a fourth gate class, never metal, crystal or the act own families', () => {
    for (const planet of MIXED_PLANETS) {
      for (const seed of SEEDS) {
        const { act, accent } = planOnWorld(planet, seed)
        if (accent === null) continue
        const taken = [...(act.commons ?? []), act.rare ?? ''].map((family) => gateClassOf(family))
        expect(taken).not.toContain(gateClassOf(accent))
        expect(['metal', 'crystal', ...familiesOfAct(act)]).not.toContain(accent)
      }
    }
  })

  it('has no accent in Act I and one on every later planet', () => {
    const accentless = MIXED_PLANETS.filter((planet) => planetMixPlanOf(planet, 7).accent === null)
    expect(accentless).toEqual([3, 4, 5, 6, 7])
  })

  it('draws the accent from earlier acts only, earlier signatures twice as often', () => {
    expect(accentPoolOf(8, actOf(8))).toEqual([{ family: 'relic', weight: 2 }])
    expect(accentPoolOf(17, actOf(17))).toEqual([
      { family: 'fossil', weight: 1 },
      { family: 'relic', weight: 2 },
      { family: 'volcanic', weight: 1 },
    ])
  })

  it('swaps band 3 to the rare on about one planet in two from P4, never before', () => {
    const swapped = PLANETS.filter((planet) => planOnWorld(planet, 83921).isBandThreeSwapped)
    expect(swapped.every((planet) => planet >= 4)).toBe(true)
    expect(swapped.length).toBeGreaterThan(70)
    expect(swapped.length).toBeLessThan(130)
  })

  it('marks P30 and P40 as story planets and no endless planet', () => {
    const story = PLANETS.filter((planet) => planetMixPlanOf(planet, 1).isStoryPlanet)
    expect(story).toEqual([30, 40])
  })

  it('gives every catalogue family a gate class and the home acts that show it', () => {
    expect(familyRows().map((row) => row.id)).toEqual(oreFamilies().map((family) => family.id))
    expect(familyRows().every((row) => row.gateClass !== undefined)).toBe(true)
    expect(familyRows().find((row) => row.id === 'relic')).toMatchObject({
      name: 'Cogwork',
      homeActs: ['foothold.heavy', 'lodestone'],
      gateClass: 'induction',
    })
  })
})
