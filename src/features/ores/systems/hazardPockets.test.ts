import { describe, expect, it } from 'vitest'
import {
  hazardPocketTestOf,
  type HazardPocketTest,
} from '../../../systems/registries/hazardPockets'
import { dockSiteOf } from '../../../systems/world/dockSite'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import {
  freshPlanetParamsFor,
  oreRulesVersionOnEntry,
  planetParamsFor,
  type PlanetParams,
} from '../../../systems/world/planetParams'
import {
  cellIndexOfTile,
  chunkKey,
  chunkOfTile,
  halfTileDistanceSq,
  halfTileRadiusSq,
  type TilePoint,
} from '../../../systems/world/tileGrid'
import { GROUND_CELL } from '../../../systems/world/worldCell'
import { ORE_ROWS } from './oreRows'
import { hazardDepthWindowCellsOf, hazardOfPlanet, type PlanetHazard } from './planetHazards'

// Each planet's hazard pockets in the ground (ticket 652, the rows of ticket 651, spec #647): planets
// 2 to 5 hold their row's kind in its depth window, a read of the planet that never repaints a cell,
// so P1 and every world a save holds under ore rules 7 or earlier keep their cells and meet none.

const HAZARD_PLANETS = [2, 3, 4, 5]
/** The pacing seeds (#84) the GD's "seen within a minute of landing" is judged on (ticket 651). */
const PACING_SEEDS = [83921, 31415, 27182]
const WORLD_SEED = PACING_SEEDS[0]
/** The ore rules every planet a save entered before ticket 652 holds at most. */
const RULES_BEFORE_POCKETS = 7
/** Ticket 651's acceptance: a pocket within 20 columns of the dock point, inside the window. */
const LANDING_COLUMNS = 20

interface PocketTile extends TilePoint {
  cell: number
  kind: string
}

/** The planet's generated cells, one chunk generated once per test. */
function cellReaderOf(params: PlanetParams): (tile: TilePoint) => number {
  const chunks = new Map<string, Uint32Array>()
  return ({ tx, ty }) => {
    const cx = chunkOfTile(tx)
    const cy = chunkOfTile(ty)
    const key = chunkKey(cx, cy)
    const cells = chunks.get(key) ?? generateChunkCells(params, cx, cy)
    chunks.set(key, cells)
    return cells[cellIndexOfTile(tx, ty)]
  }
}

/** Every pocket in the columns either side of the dock point, from the pad down past the window. */
function pocketsUnderDock(params: PlanetParams, columns: number): PocketTile[] {
  const test = hazardPocketTestOf(params) as HazardPocketTest
  const cellAt = cellReaderOf(params)
  const { padRow } = dockSiteOf(params)
  const deepest = padRow - hazardWindowOf(params).toCells - 1
  const pockets: PocketTile[] = []
  for (let tx = -columns; tx <= columns; tx++) {
    for (let ty = padRow; ty >= deepest; ty--) {
      const cell = cellAt({ tx, ty })
      const kind = test({ tx, ty }, cell)
      if (kind !== null) pockets.push({ tx, ty, cell, kind })
    }
  }
  return pockets
}

function hazardWindowOf(params: PlanetParams) {
  const hazard = hazardOfPlanet(ORE_ROWS.planets, params.planetIndex) as PlanetHazard
  return hazardDepthWindowCellsOf(hazard, params.radiusTiles)
}

/** The tile's radial depth in whole cells below the surface, counted as the surface layer counts. */
function depthCellsOf(params: PlanetParams, tile: TilePoint): number {
  const distanceSq = halfTileDistanceSq(tile.tx, tile.ty)
  let depth = 0
  while (distanceSq <= halfTileRadiusSq(params.radiusTiles - depth - 1)) depth++
  return depth
}

describe('hazard pockets', () => {
  it('lays no pocket on planet 1, which stays on the ore rules it had', () => {
    expect(oreRulesVersionOnEntry(1)).toBe(2)
    expect(hazardPocketTestOf(freshPlanetParamsFor(WORLD_SEED, 1))).toBeNull()
  })

  it('lays no pocket on a planet a save holds under ore rules 7 or earlier', () => {
    for (const planet of HAZARD_PLANETS) {
      for (let rules = 1; rules <= RULES_BEFORE_POCKETS; rules++) {
        expect(hazardPocketTestOf(planetParamsFor(WORLD_SEED, planet, rules))).toBeNull()
      }
      expect(hazardPocketTestOf(planetParamsFor(WORLD_SEED, planet))).toBeNull()
    }
  })

  it('lays no pocket past planet 5, whose rows hold no hazard yet', () => {
    expect(hazardPocketTestOf(freshPlanetParamsFor(WORLD_SEED, 6))).toBeNull()
    expect(hazardPocketTestOf(freshPlanetParamsFor(WORLD_SEED, 11))).toBeNull()
  })

  it("gives each of planets 2 to 5 pockets of its own row's kind", () => {
    const kinds = HAZARD_PLANETS.map((planet) => {
      const pockets = pocketsUnderDock(freshPlanetParamsFor(WORLD_SEED, planet), LANDING_COLUMNS)
      return [...new Set(pockets.map((pocket) => pocket.kind))]
    })
    expect(kinds).toEqual([['rockfall'], ['firedamp'], ['spinecrystal'], ['steamvent']])
  })

  it('puts a pocket within 20 columns of the dock point on each of planets 2 to 5 on every pacing seed', () => {
    for (const seed of PACING_SEEDS) {
      for (const planet of HAZARD_PLANETS) {
        const pockets = pocketsUnderDock(freshPlanetParamsFor(seed, planet), LANDING_COLUMNS)
        expect(pockets.length, `seed ${seed}, planet ${planet}`).toBeGreaterThan(0)
      }
    }
  })

  it('lays pockets only on plain ground inside the depth window', () => {
    for (const planet of HAZARD_PLANETS) {
      const params = freshPlanetParamsFor(WORLD_SEED, planet)
      const window = hazardWindowOf(params)
      for (const pocket of pocketsUnderDock(params, LANDING_COLUMNS)) {
        const depth = depthCellsOf(params, pocket)
        expect(pocket.cell).toBe(GROUND_CELL)
        expect(depth).toBeGreaterThanOrEqual(window.fromCells)
        expect(depth).toBeLessThan(window.toCells)
      }
    }
  })

  it('leaves the generated cells of planets 2 to 5 as ore rules 7 made them', () => {
    for (const planet of HAZARD_PLANETS) {
      const fresh = freshPlanetParamsFor(WORLD_SEED, planet)
      const before = planetParamsFor(WORLD_SEED, planet, RULES_BEFORE_POCKETS)
      const { padRow } = dockSiteOf(fresh)
      for (const cx of [-1, 0]) {
        for (const cy of [chunkOfTile(padRow), chunkOfTile(padRow) - 1, chunkOfTile(padRow) - 2]) {
          expect(generateChunkCells(fresh, cx, cy)).toEqual(generateChunkCells(before, cx, cy))
        }
      }
    }
  })
})
