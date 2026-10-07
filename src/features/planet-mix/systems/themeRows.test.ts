import { describe, expect, it } from 'vitest'
import economyFile from '../planet-mix.economy.json'
import themesFile from '../oreThemes.json'
import { themeRowProblems } from './themeRows'

function themesWith(change: Record<string, unknown>) {
  return { ...structuredClone(themesFile), ...change }
}

describe('planet-mix data', () => {
  it('accepts the shipped files', () => {
    expect(themeRowProblems(themesFile, economyFile)).toEqual([])
  })

  it('refuses a catalogue family with no gate class, and lists every problem', () => {
    const { metal: _metal, ...gateClasses } = themesFile.gateClassByFamily
    const problems = themeRowProblems(
      themesWith({ gateClassByFamily: gateClasses, swapChanceBp: -1 }),
      economyFile,
    )
    expect(problems).toContain('family "metal" needs a gateClass')
    expect(problems).toContain('swapChanceBp must be in basis points')
  })

  it('refuses acts that leave a gap or name a family the catalogue lacks', () => {
    const acts = structuredClone(themesFile.acts)
    acts[2].firstPlanet = 9
    acts[3].rare = 'mithril'
    const problems = themeRowProblems(themesWith({ acts }), economyFile)
    expect(problems).toContain('act "fire" must run from planet 8')
    expect(problems.some((problem) => problem.includes('"mithril"'))).toBe(true)
  })

  it('refuses an endless cycle that does not follow the campaign or names no act', () => {
    const endless = { fromPlanet: 40, cycle: ['fire', 'lava'] }
    const problems = themeRowProblems(themesWith({ endless }), economyFile)
    expect(problems).toEqual([
      'endless.fromPlanet must follow the last act',
      'endless.cycle must list two or more act ids',
    ])
  })

  it('refuses a signature share outside bands 4 and 5', () => {
    const economy = { mix: { signatureShareBpByBand: { 3: 300 }, signatureBoost: 2 } }
    expect(themeRowProblems(themesFile, economy)).toContain(
      'mix.signatureShareBpByBand must give bands 4 and 5 a share',
    )
  })
})
