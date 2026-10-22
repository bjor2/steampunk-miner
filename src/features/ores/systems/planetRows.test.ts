import { describe, expect, it } from 'vitest'
import {
  ORE_RULES_VERSION,
  RADIUS_ROWS_ORE_RULES,
  radiusForPlanet,
} from '../../../systems/world/planetParams'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { ORE_ROWS, oreRowProblems } from './oreRows'
import { planetRowProblems, radiusTilesOfPlanet, type PlanetRowContext } from './planetRows'

// The planet registry (GD lock R1 on #302, 6306854642, and its addendum 6306861669): each planet's
// row holds its species pool and its radius, frozen from R(p) = round(300 + 175 ln p).

type Row = Record<string, unknown>

const SHIPPED_ROWS: readonly Row[] = economyFile.ore.planets.rows
const ONE_SYSTEM: PlanetRowContext = { solarSystemOf: () => 1 }
/** A second solar system from planet 5. */
const TWO_SYSTEMS: PlanetRowContext = { solarSystemOf: (planet) => (planet < 5 ? 1 : 2) }

/** The shipped block with its rows replaced. */
function problemsWithRows(rows: readonly Row[], context = ONE_SYSTEM): string[] {
  return planetRowProblems({ ...economyFile.ore.planets, rows }, context)
}

/** The shipped rows with row `at` changed. */
function rowsWith(at: number, change: Row): Row[] {
  return SHIPPED_ROWS.map((row, index) => (index === at ? { ...row, ...change } : row))
}

/** Planet 1's frozen radius at `tiles`, its ore rules key and reason kept. */
function frozenAt(tiles: unknown, change: Row = {}): Row {
  return { ...(SHIPPED_ROWS[0].radius as Row), tiles, ...change }
}

/** R(p) = round(base + k ln p): the rule the rows were generated from once, never at runtime. */
function radiusByRule(planet: number): number {
  const { baseTiles, lnCoefficient } = ORE_ROWS.planets.radiusRule
  return Math.round(baseTiles + lnCoefficient * Math.log(planet))
}

describe('planet registry', () => {
  it('accepts the shipped rows: one per planet from 1 to 10, the pool on the same row', () => {
    expect(oreRowProblems(economyFile, familiesFile)).toEqual([])
    expect(ORE_ROWS.planets.rows.map((row) => row.planetIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(ORE_ROWS.planets.rows[3]).toMatchObject({ pool: 'foothold-p4', radius: { tiles: 543 } })
  })

  it('freezes every radius as R(p) = round(300 + 175 ln p) with the one shared k', () => {
    expect(ORE_ROWS.planets.radiusRule).toEqual({
      baseTiles: 300,
      lnCoefficient: 175,
      lnCoefficientBounds: [150, 200],
    })
    const frozen = ORE_ROWS.planets.rows.map((row) => row.radius.tiles)
    expect(frozen).toEqual(ORE_ROWS.planets.rows.map((row) => radiusByRule(row.planetIndex)))
    expect(frozen).toEqual([300, 421, 492, 543, 582, 614, 641, 664, 685, 703])
  })

  it('keeps planet 1 at the radius the generator gives it today', () => {
    expect(radiusTilesOfPlanet(ORE_ROWS.planets, 1)).toBe(radiusForPlanet(1))
  })

  it('reads a planet past the last row as having no radius row', () => {
    expect(radiusTilesOfPlanet(ORE_ROWS.planets, 11)).toBeNull()
    expect(radiusTilesOfPlanet(ORE_ROWS.planets, 200)).toBeNull()
  })

  it('records no measured minutes until the paired run measures each radius', () => {
    expect(ORE_ROWS.planets.rows.every((row) => row.measuredMinutes === null)).toBe(true)
    expect(problemsWithRows(rowsWith(1, { measuredMinutes: 24.5 }))).toEqual([])
    expect(problemsWithRows(rowsWith(1, { measuredMinutes: 0 }))).toEqual([
      'ore.planets.rows[1].measuredMinutes must be null or minutes above 0',
    ])
  })

  it('never shrinks a radius within a solar system', () => {
    const radii = ORE_ROWS.planets.rows.map((row) => row.radius.tiles)
    expect(radii.every((radius, at) => at === 0 || radius >= radii[at - 1])).toBe(true)
  })

  it('refuses a shrink inside a solar system unless the row names why', () => {
    const shrunk = rowsWith(5, { radius: frozenAt(500) })
    expect(problemsWithRows(shrunk)).toEqual([
      "ore.planets.rows[5].radius.tiles shrinks below planet 5's with no radiusShrinkWhy",
    ])
    const named = rowsWith(5, { radius: frozenAt(500), radiusShrinkWhy: 'a small moon planet' })
    expect(problemsWithRows(named)).toEqual([])
  })

  it('lets a new solar system start smaller with no reason', () => {
    expect(problemsWithRows(rowsWith(4, { radius: frozenAt(400) }), TWO_SYSTEMS)).toEqual([])
    expect(problemsWithRows(rowsWith(4, { radius: frozenAt(400) }), ONE_SYSTEM)).toHaveLength(1)
  })

  it('refuses a shrink reason on a row that does not shrink', () => {
    expect(problemsWithRows(rowsWith(2, { radiusShrinkWhy: 'no shrink here' }))).toEqual([
      'ore.planets.rows[2].radiusShrinkWhy names a shrink the row does not make',
    ])
  })

  it('refuses a gap, a radius that is not whole and a field no row holds', () => {
    const gap = SHIPPED_ROWS.filter((row) => row.planet !== 3)
    expect(problemsWithRows(gap)[0]).toBe(
      'ore.planets.rows[2].planet must be 3: planets 1 to n, no gap',
    )
    expect(
      problemsWithRows(rowsWith(0, { radius: frozenAt(300.5), speciesPool: 'legacy' })),
    ).toEqual([
      'ore.planets.rows[0].radius.tiles must be whole, from 1',
      'ore.planets.rows[0].speciesPool is not a planet row field',
    ])
    expect(problemsWithRows([])).toEqual(['ore.planets.rows must list planets from 1'])
  })

  it('keys every frozen radius on ore rules 7 with its reason, so an older stamp keeps the ladder', () => {
    for (const { radius } of ORE_ROWS.planets.rows) {
      expect(radius.fromOreRules).toBe(RADIUS_ROWS_ORE_RULES)
      expect(radius.reason).toMatch(/R\(p\) = round\(300 \+ 175 ln p\)/)
    }
  })

  it('refuses a frozen radius with no reason, an ore rules key outside 7 to now or a stray field', () => {
    expect(problemsWithRows(rowsWith(0, { radius: frozenAt(300, { reason: ' ' }) }))).toEqual([
      'ore.planets.rows[0].radius.reason must say why',
    ])
    for (const fromOreRules of [RADIUS_ROWS_ORE_RULES - 1, ORE_RULES_VERSION + 1]) {
      expect(problemsWithRows(rowsWith(0, { radius: frozenAt(300, { fromOreRules }) }))).toEqual([
        `ore.planets.rows[0].radius.fromOreRules must be ore rules 7 to ${ORE_RULES_VERSION}`,
      ])
    }
    expect(problemsWithRows(rowsWith(0, { radius: frozenAt(300, { k: 175 }) }))).toEqual([
      'ore.planets.rows[0].radius.k is not a radius field',
    ])
    expect(problemsWithRows(rowsWith(0, { radius: 300 }))).toEqual([
      'ore.planets.rows[0].radius must hold tiles, fromOreRules and a reason',
    ])
  })

  it('refuses a pool id that is not kebab-case and a pool after a planet with none', () => {
    expect(problemsWithRows(rowsWith(1, { pool: 'Foothold.P2' }))).toEqual([
      'ore.planets.rows[1].pool must be a pool id',
    ])
    expect(problemsWithRows(rowsWith(8, { pool: 'foothold-p9' }))).toEqual([
      'ore.planets.rows[8] has a pool after planet 8, which has none',
    ])
  })

  it('refuses a shared k outside its bounds', () => {
    const rule = { ...economyFile.ore.planets.radiusRule, lnCoefficient: 210 }
    const planets = { ...economyFile.ore.planets, radiusRule: rule }
    expect(planetRowProblems(planets, ONE_SYSTEM)).toEqual([
      'ore.planets.radiusRule.lnCoefficient must be a whole number from 150 to 200',
    ])
  })
})
