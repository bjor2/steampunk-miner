import { describe, expect, it } from 'vitest'
import economyFile from '../planet-mix.economy.json'
import classesFile from '../planetClasses.json'
import { actOf, gateClassOf } from './planetActs'
import { isMagneticPlanet, planetClassOf } from './planetClass'
import { PLANET_CLASS_ROWS, planetClassRowProblems } from './planetClassRows'
import { THEME_ROWS } from './themeRows'

const CAMPAIGN = Array.from({ length: 40 }, (_, at) => at + 1)
const ENDLESS = Array.from({ length: 160 }, (_, at) => at + 41)

const planetsOfAct = (planets: readonly number[], actId: string) =>
  planets.filter((planet) => actOf(planet).id === actId)

describe('planet class', () => {
  it('every Lodestone-act planet is magnetic and P30 is relic, not magnetic', () => {
    const lodestone = planetsOfAct(CAMPAIGN, 'lodestone')
    expect(lodestone).toEqual([25, 26, 27, 28, 29, 30, 31, 32])
    expect(lodestone.filter((planet) => planet !== 30).map((p) => planetClassOf(p))).toEqual(
      Array(7).fill('magnetic'),
    )
    expect(planetClassOf(30)).toBe('relic')
    expect(CAMPAIGN.filter(isMagneticPlanet)).toEqual([25, 26, 27, 28, 29, 31, 32])
  })

  it('endless P43, P48 and every fifth are magnetic, read from the act id', () => {
    const magnetic = ENDLESS.filter(isMagneticPlanet)
    expect(magnetic.slice(0, 3)).toEqual([43, 48, 53])
    expect(magnetic).toEqual(ENDLESS.filter((planet) => (planet - 43) % 5 === 0))
    const turned = { ...THEME_ROWS, endlessCycle: ['lodestone', 'fire', 'frost', 'hollow'] }
    const turnedMagnetic = ENDLESS.filter(
      (planet) => planetClassOf(planet, PLANET_CLASS_ROWS, turned) === 'magnetic',
    )
    expect(turnedMagnetic.slice(0, 3)).toEqual([41, 45, 49])
  })

  it('frost and hollow acts answer their own class from the same table', () => {
    const classesOf = (actId: string) =>
      new Set(planetsOfAct([...CAMPAIGN, ...ENDLESS], actId).map((p) => planetClassOf(p)))
    expect(classesOf('frost')).toEqual(new Set(['frozen']))
    expect(classesOf('hollow')).toEqual(new Set(['hollow']))
    expect(classesOf('lodestone')).toEqual(new Set(['magnetic', 'relic']))
  })

  it('gives the Foothold and Fire acts no class', () => {
    const classless = [...CAMPAIGN, ...ENDLESS].filter((planet) => planetClassOf(planet) === null)
    expect(new Set(classless.map((planet) => actOf(planet).id))).toEqual(
      new Set(['foothold.base', 'foothold.heavy', 'fire']),
    )
  })

  it("keeps the induction-class ore the Lodestone act's existing relic rare", () => {
    const lodestone = actOf(25)
    expect(lodestone.rare).toBe('relic')
    expect(gateClassOf('relic')).toBe('induction')
    expect(lodestone.commons).toEqual(['metal', 'energy'])
  })

  it('accepts the committed files and refuses an unknown act, class or story planet', () => {
    expect(planetClassRowProblems(classesFile, economyFile)).toEqual([])
    const broken = {
      classByAct: { lodestone: 'magnetic', moon: 'frozen', frost: 'icy' },
      classByStoryPlanet: { '29': 'relic' },
    }
    const economy = { magnetic: { fieldMarginTiles: -1, electrifiedShareBp: 10001 } }
    expect(planetClassRowProblems(broken, economy)).toEqual([
      'classByAct names "moon", which no act has',
      'classByAct.frost must name a planet class',
      'classByStoryPlanet names planet 29, which is no story planet',
      'magnetic.fieldMarginTiles must be whole, from 0',
      'magnetic.electrifiedShareBp must be in basis points',
    ])
  })
})
