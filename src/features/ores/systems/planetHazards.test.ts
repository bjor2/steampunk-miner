import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../../../systems/unlocks/unlockSchedule'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { surfaceLayerOf } from '../../../systems/world/surfaceLayer'
import economyFile from '../ores.economy.json'
import { ORE_ROWS } from './oreRows'
import {
  hazardDepthWindowCellsOf,
  hazardOfPlanet,
  planetHazardProblems,
  type PlanetHazard,
} from './planetHazards'
import { planetRowProblems, type PlanetRowContext } from './planetRows'

// Per-planet hazards for P2 to P5 (ticket 651, spec #647): one distinct hazard per planet, written
// on the planet's own registry row, placed by fraction of radius with a pocket density, and read
// as one card line on arrival. P1 carries none, so it stays byte-identical.

type Row = Record<string, unknown>

const SHIPPED = economyFile.ore.planets
const SHIPPED_ROWS: readonly Row[] = SHIPPED.rows
const ONE_SYSTEM: PlanetRowContext = { solarSystemOf: () => 1 }
const HAZARD_PLANETS = [2, 3, 4, 5]
const WORLD_SEED = 83921
/** The pad view the arrival line is judged in: the columns either side of the dock point. */
const PAD_VIEW_COLUMNS = 40
/** The 360 px card holds about 38 characters a line; two lines is the most a read may take. */
const CARD_LINE_CHARACTERS = 64
const BASIS_POINTS = 10000

const rowOf = (planet: number): Row => SHIPPED_ROWS[planet - 1]
const hazardRowOf = (planet: number): Row => rowOf(planet).hazard as Row

/** The shipped block with its rows replaced. */
function problemsWithRows(rows: readonly Row[]): string[] {
  return planetRowProblems({ ...SHIPPED, rows }, ONE_SYSTEM)
}

/** The shipped rows with planet `planet`'s hazard changed (`null` removes it). */
function rowsWithHazard(planet: number, change: Row | null): Row[] {
  return SHIPPED_ROWS.map((row) => {
    if (row.planet !== planet) return row
    if (change === null) {
      const { hazard: _removed, ...rest } = row
      return rest
    }
    return { ...row, hazard: { ...(row.hazard as Row), ...change } }
  })
}

/** The shipped block with one hazard kind changed. */
function problemsWithKind(kind: string, change: Row): string[] {
  const hazards = {
    ...SHIPPED.hazards,
    [kind]: { ...((SHIPPED.hazards as Row)[kind] as Row), ...change },
  }
  return planetHazardProblems({ ...SHIPPED, hazards }, SHIPPED.rows)
}

/** Pockets the pad view holds on average: its lattice blocks times the chance of each. */
function expectedPocketsInPadView(hazard: PlanetHazard, radiusTiles: number): number {
  const window = hazardDepthWindowCellsOf(hazard, radiusTiles)
  const columns = PAD_VIEW_COLUMNS / hazard.pocketTiles
  const rows = (window.toCells - window.fromCells) / hazard.pocketTiles
  return (columns * rows * hazard.pocketChanceBp) / BASIS_POINTS
}

describe('per-planet hazards', () => {
  it('gives each of planets 2 to 5 its own hazard kind and planet 1 none', () => {
    expect(problemsWithRows(SHIPPED_ROWS)).toEqual([])
    const kinds = HAZARD_PLANETS.map((planet) => hazardOfPlanet(ORE_ROWS.planets, planet)?.kind)
    expect(kinds).toEqual(['rockfall', 'firedamp', 'spinecrystal', 'steamvent'])
    expect(new Set(kinds).size).toBe(HAZARD_PLANETS.length)
    expect(hazardOfPlanet(ORE_ROWS.planets, 1)).toBeNull()
    expect(hazardOfPlanet(ORE_ROWS.planets, 6)).toBeNull()
    expect(hazardOfPlanet(ORE_ROWS.planets, 11)).toBeNull()
  })

  it('names every row hazard in the kind table, each with the numbers its effect uses', () => {
    const kinds = ORE_ROWS.planets.hazards
    expect(Object.keys(kinds).sort()).toEqual(['firedamp', 'rockfall', 'spinecrystal', 'steamvent'])
    expect(kinds.rockfall).toEqual({ effect: 'refill', hullShareBp: 300 })
    expect(kinds.firedamp).toEqual({ effect: 'drain', energyShareBp: 1500, ticks: 180 })
    expect(kinds.spinecrystal).toEqual({ effect: 'bite', hullShareBp: 200 })
    expect(kinds.steamvent).toEqual({ effect: 'shove', hullShareBp: 200, shoveTiles: 3, ticks: 20 })
  })

  it('places a depth window as floor(num * R / den) in whole cells from the surface', () => {
    const hazard = hazardOfPlanet(ORE_ROWS.planets, 2) as PlanetHazard
    expect(hazard.fromDepth).toEqual([1, 40])
    expect(hazard.toDepth).toEqual([1, 8])
    expect(hazardDepthWindowCellsOf(hazard, 421)).toEqual({ fromCells: 10, toCells: 52 })
    expect(hazardDepthWindowCellsOf(hazard, 300)).toEqual({ fromCells: 7, toCells: 37 })
  })

  it('starts each window below the pinned surface layer and inside band 1 on a fresh planet', () => {
    for (const planet of HAZARD_PLANETS) {
      const params = freshPlanetParamsFor(WORLD_SEED, planet)
      const layer = surfaceLayerOf(params)
      const hazard = hazardOfPlanet(ORE_ROWS.planets, planet) as PlanetHazard
      const window = hazardDepthWindowCellsOf(hazard, params.radiusTiles)
      expect(layer).not.toBeNull()
      expect(window.fromCells).toBeGreaterThan(layer!.pinnedCells + layer!.rampCells)
      expect(window.fromCells).toBeLessThan(layer!.bandOneCells)
      expect(window.toCells).toBeGreaterThan(window.fromCells)
    }
  })

  it('is dense enough that the pad view holds several pockets, so one is seen within a minute', () => {
    for (const planet of HAZARD_PLANETS) {
      const hazard = hazardOfPlanet(ORE_ROWS.planets, planet) as PlanetHazard
      const radius = ORE_ROWS.planets.rows[planet - 1].radius.tiles
      expect(expectedPocketsInPadView(hazard, radius)).toBeGreaterThanOrEqual(5)
    }
  })

  it('reads each hazard as a tag and one arrival line that fits the 360 px card', () => {
    for (const planet of HAZARD_PLANETS) {
      const { tag, arrivalLine } = hazardOfPlanet(ORE_ROWS.planets, planet) as PlanetHazard
      expect(tag.length).toBeLessThanOrEqual(12)
      expect(arrivalLine.startsWith(`${tag}. `)).toBe(true)
      expect(arrivalLine.length).toBeLessThanOrEqual(CARD_LINE_CHARACTERS)
      expect(arrivalLine.endsWith('.')).toBe(true)
      expect(arrivalLine).not.toMatch(/\d/)
      expect(unlockIdNamedIn(LOCKED_SCHEDULE, arrivalLine)).toBeUndefined()
    }
  })

  it('refuses a hazard on planet 1 and a missing one on planets 2 to 5', () => {
    const onPlanetOne = SHIPPED_ROWS.map((row) =>
      row.planet === 1 ? { ...row, hazard: hazardRowOf(2) } : row,
    )
    expect(problemsWithRows(onPlanetOne)).toEqual([
      'ore.planets.rows[0].hazard: planet 1 stays byte-identical and holds no hazard',
      'ore.planets.rows[1].hazard.kind "rockfall" is also planet 1\'s',
    ])
    expect(problemsWithRows(rowsWithHazard(4, null))).toEqual([
      'ore.planets.rows[3].hazard is missing: planets 2 to 5 each hold one',
    ])
  })

  it('refuses two planets sharing a hazard kind and a kind the table does not hold', () => {
    expect(problemsWithRows(rowsWithHazard(3, { kind: 'rockfall' }))).toEqual([
      'ore.planets.rows[2].hazard.kind "rockfall" is also planet 2\'s',
    ])
    expect(problemsWithRows(rowsWithHazard(3, { kind: 'quicksand' }))).toEqual([
      'ore.planets.rows[2].hazard.kind "quicksand" is not in ore.planets.hazards',
    ])
  })

  it('refuses a window that is not two rising fractions of the radius', () => {
    expect(problemsWithRows(rowsWithHazard(2, { fromDepth: [1, 8], toDepth: [1, 40] }))).toEqual([
      'ore.planets.rows[1].hazard.fromDepth must lie above toDepth',
    ])
    expect(problemsWithRows(rowsWithHazard(2, { toDepth: [3, 2] }))).toEqual([
      'ore.planets.rows[1].hazard.toDepth must be [num, den], whole, with 1 <= num < den',
    ])
    expect(problemsWithRows(rowsWithHazard(2, { fromDepth: [0.5, 40] }))).toEqual([
      'ore.planets.rows[1].hazard.fromDepth must be [num, den], whole, with 1 <= num < den',
    ])
  })

  it('refuses a pocket lattice outside 2 to 8 tiles or a chance outside basis points', () => {
    expect(problemsWithRows(rowsWithHazard(5, { pocketTiles: 1 }))).toEqual([
      'ore.planets.rows[4].hazard.pocketTiles must be whole, from 2 to 8',
    ])
    expect(problemsWithRows(rowsWithHazard(5, { pocketChanceBp: 10001 }))).toEqual([
      'ore.planets.rows[4].hazard.pocketChanceBp must be whole, from 1 to 10000',
    ])
  })

  it('refuses card copy with digits, without its tag, over the card width or naming an unlock', () => {
    expect(problemsWithRows(rowsWithHazard(2, { arrivalLine: 'Rockfall. Cuts 3 deep.' }))).toEqual([
      'ore.planets.rows[1].hazard.arrivalLine holds a digit: the ledger voice spells numbers out',
    ])
    expect(problemsWithRows(rowsWithHazard(2, { arrivalLine: 'Scree pours down.' }))).toEqual([
      'ore.planets.rows[1].hazard.arrivalLine must open with "Rockfall. " and end with a full stop',
    ])
    const long = `Rockfall. ${'Loose scree pours down the shaft and '.repeat(3)}buries you.`
    expect(problemsWithRows(rowsWithHazard(2, { arrivalLine: long }))).toEqual([
      `ore.planets.rows[1].hazard.arrivalLine is over ${CARD_LINE_CHARACTERS} characters, the 360 px card`,
    ])
    expect(problemsWithRows(rowsWithHazard(2, { tag: 'Loose Scree Falls' }))).toEqual([
      'ore.planets.rows[1].hazard.tag must be one or two capitalised words, 12 characters at most',
      'ore.planets.rows[1].hazard.arrivalLine must open with "Loose Scree Falls. " and end with a full stop',
    ])
  })

  it('refuses a field no hazard row holds', () => {
    expect(problemsWithRows(rowsWithHazard(3, { density: 5 }))).toEqual([
      'ore.planets.rows[2].hazard.density is not a hazard field',
    ])
  })

  it('refuses a kind whose effect lacks its numbers, exceeds the caps or has a stray field', () => {
    expect(problemsWithKind('firedamp', { ticks: undefined })).toEqual([
      'ore.planets.hazards.firedamp.ticks must be whole, from 1 to 3600',
    ])
    expect(problemsWithKind('rockfall', { hullShareBp: 600 })).toEqual([
      'ore.planets.hazards.rockfall.hullShareBp must be whole, from 1 to 500 (hazardCaps.hullShareBp)',
    ])
    expect(problemsWithKind('firedamp', { energyShareBp: 2600 })).toEqual([
      'ore.planets.hazards.firedamp.energyShareBp must be whole, from 1 to 2500 (hazardCaps.energyShareBp)',
    ])
    expect(problemsWithKind('spinecrystal', { shoveTiles: 2 })).toEqual([
      'ore.planets.hazards.spinecrystal.shoveTiles is not a field of the bite effect',
    ])
    expect(problemsWithKind('steamvent', { effect: 'melt' })).toEqual([
      'ore.planets.hazards.steamvent.effect must be refill, drain, bite or shove',
    ])
  })

  it('refuses caps that are not whole basis points', () => {
    const hazardCaps = { ...SHIPPED.hazardCaps, diveHullCapBp: 0 }
    expect(planetHazardProblems({ ...SHIPPED, hazardCaps }, SHIPPED.rows)).toEqual([
      'ore.planets.hazardCaps.diveHullCapBp must be whole, from 1 to 10000',
    ])
  })
})
