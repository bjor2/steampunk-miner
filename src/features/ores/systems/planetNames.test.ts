import { describe, expect, it } from 'vitest'
import { PLANET_NAME_CHARACTERS_MAX } from '../../../constants/uiParts'
import { DESIGN_TOKENS } from '../../../systems/views/designSystem'
import { uiScaleOf } from '../../../systems/views/screenLayout'
import economyFile from '../ores.economy.json'
import { ORE_ROWS } from './oreRows'
import { generatedPlanetNameOf } from './planetNames'
import { nameOfPlanet, planetRowProblems, type PlanetRowContext } from './planetRows'

// Planet display names (ticket 702, spec #678): Planet & Narrative's name on planets 1 to 7, a
// generated one from planet 8, each within the 360 px and 1280x800 budget.

type Row = Record<string, unknown>

const PLANETS = economyFile.ore.planets
const SHIPPED_ROWS: readonly Row[] = PLANETS.rows
const ONE_SYSTEM: PlanetRowContext = { solarSystemOf: () => 1 }
/** A conservative average advance of the body serif (Georgia), in em. */
const SERIF_ADVANCE_EM = 0.6
/** The screens the name must fit, as [width, height] in CSS px. */
const SCREENS: readonly (readonly [number, number])[] = [
  [360, 640],
  [1280, 800],
]

function rowsWith(at: number, change: Row): Row[] {
  return SHIPPED_ROWS.map((row, index) => (index === at ? { ...row, ...change } : row))
}

function rowsWithout(at: number, field: string): Row[] {
  return SHIPPED_ROWS.map((row, index) =>
    index === at ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== field)) : row,
  )
}

function problemsWith(change: Row): string[] {
  return planetRowProblems({ ...PLANETS, ...change }, ONE_SYSTEM)
}

function nameOf(planet: number): string {
  return nameOfPlanet(ORE_ROWS.planets, planet)
}

/** The width of `name` at the display role on a screen, against the width inside its margins. */
function displayFitOf(name: string, [width, height]: readonly [number, number]) {
  const scale = uiScaleOf(Math.min(width, height), false)
  const textPx = name.length * SERIF_ADVANCE_EM * DESIGN_TOKENS.type.sizesPx.display * scale
  return { textPx, roomPx: width - 2 * DESIGN_TOKENS.layout.marginPx * scale }
}

describe('planet names', () => {
  it('names planets 1 to 7 from their registry rows', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(nameOf)).toEqual([
      'Hearthmoor',
      'Gravelholm',
      'Coalfen',
      'Spinegarth',
      'Kettlecrag',
      'Salt Reach',
      'Windmesa',
    ])
  })

  it('carries a name on every row before the generated names and none after', () => {
    const { fromPlanet } = ORE_ROWS.planets.generatedNames
    const named = ORE_ROWS.planets.rows.filter((row) => row.name !== null)
    expect(named.map((row) => row.planetIndex)).toEqual(
      Array.from({ length: fromPlanet - 1 }, (_, at) => at + 1),
    )
  })

  it('resolves a name for every planet, past the last row and far past it', () => {
    const planets = [...Array.from({ length: 300 }, (_, at) => at + 1), 99_999, 640_000]
    expect(planets.filter((planet) => nameOf(planet).trim() === '')).toEqual([])
  })

  it('gives each of the first 64 generated planets its own name, then numbers the laps', () => {
    const firstLap = Array.from({ length: 64 }, (_, at) => nameOf(at + 8))
    expect(new Set([...firstLap, ...[1, 2, 3, 4, 5, 6, 7].map(nameOf)]).size).toBe(71)
    expect([nameOf(8), nameOf(9), nameOf(16)]).toEqual(['Ashholt', 'Brassholt', 'Ashmere'])
    expect([nameOf(72), nameOf(136)]).toEqual(['Ashholt 2', 'Ashholt 3'])
  })

  it('keeps the longest name within the budget, a four-digit lap included', () => {
    const generated = ORE_ROWS.planets.generatedNames
    const lapPlanet = generated.fromPlanet + 9998 * 64
    const longestStep = Array.from({ length: 64 }, (_, at) =>
      generatedPlanetNameOf(generated, lapPlanet + at),
    ).sort((a, b) => b.length - a.length)[0]
    const rowNames = [1, 2, 3, 4, 5, 6, 7].map(nameOf)
    const longest = [...rowNames, longestStep].sort((a, b) => b.length - a.length)[0]
    expect(longestStep).toMatch(/ 9999$/)
    expect(longest.length).toBeLessThanOrEqual(PLANET_NAME_CHARACTERS_MAX)
  })

  it('fits a name of the budget at the display size on 360 px and 1280x800', () => {
    const budgetName = 'W'.repeat(PLANET_NAME_CHARACTERS_MAX)
    for (const screen of SCREENS) {
      const { textPx, roomPx } = displayFitOf(budgetName, screen)
      expect(textPx).toBeLessThanOrEqual(roomPx)
    }
  })

  it('refuses a row before planet 8 without a name and a row from it with one', () => {
    expect(problemsWith({ rows: rowsWithout(2, 'name') })).toEqual([
      'ore.planets.rows[2] must carry a name: planet 3 is before the generated names',
    ])
    expect(problemsWith({ rows: rowsWith(8, { name: 'Ninthstead' }) })).toEqual([
      'ore.planets.rows[8].name is set, but planet 9 takes a generated name',
    ])
  })

  it('refuses a shared name, a digit and a name over the budget', () => {
    expect(problemsWith({ rows: rowsWith(1, { name: 'Hearthmoor' }) })).toEqual([
      'ore.planets.rows: the name "Hearthmoor" names two planets',
    ])
    expect(problemsWith({ rows: rowsWith(3, { name: 'Spine 4' }) })).toEqual([
      'ore.planets.rows[3].name "Spine 4" holds a digit',
    ])
    expect(problemsWith({ rows: rowsWith(4, { name: 'The Kettle Crag Vents' }) })).toEqual([
      'ore.planets.rows[4].name "The Kettle Crag Vents" is over 16 characters',
      'ore.planets.rows[4].name "The Kettle Crag Vents" is over 3 words',
    ])
  })

  it('refuses a generator whose longest name with a lap overflows the budget', () => {
    const generatedNames = { ...PLANETS.generatedNames, stems: ['Ash', 'Brassbound'] }
    expect(problemsWith({ generatedNames })).toEqual([
      'ore.planets.generatedNames: the longest name with a lap takes 20 characters, over 16',
    ])
  })

  it('refuses a generator with no first planet or a broken word list', () => {
    expect(problemsWith({ generatedNames: undefined })).toEqual([
      'ore.planets.generatedNames must hold fromPlanet, stems and endings',
    ])
    expect(
      problemsWith({
        generatedNames: { fromPlanet: 1, stems: ['ash'], endings: ['holt', 'holt'] },
      }),
    ).toEqual([
      'ore.planets.generatedNames.fromPlanet must be a whole planet after planet 1',
      'ore.planets.generatedNames.stems must list capitalised words',
      'ore.planets.generatedNames.endings lists a word twice',
    ])
  })
})
