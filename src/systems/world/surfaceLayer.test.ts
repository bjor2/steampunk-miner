import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { hardnessOfTile } from '../authority/groundDrill'
import { ECONOMY } from '../economy/economy'
import { blockHardness, oreHardness, oreTier } from '../economy/oreEconomy'
import type { SurfaceLayerRules } from '../economy/surfaceLayerRules'
import { onCurveSteps, vehicleStatsAt } from '../economy/vehicleStats'
import { cmp, div, fromCanonical, toCanonical, type BigStat } from '../money'
import { drillWorkPerTick, tileWorkToBreak, type DrillStats } from '../vehicle/drillRule'
import { freshPlanetParamsFor, planetParamsFor, type PlanetParams } from './planetParams'
import { bandOfTile } from './planetGeometry'
import {
  buildSurfaceLayer,
  isRampCapped,
  isRampPastBandOne,
  surfaceLayerOf,
  surfaceRockHardnessAt,
} from './surfaceLayer'
import type { TilePoint } from './tileGrid'
import { GROUND_CELL, oreCell, RESOURCE_FAMILY } from './worldCell'

// Ticket 625: Systems' spec on #306 (6301879176), the ramp amendment (6301918833) and the VS
// confirmation (6301930425) on #625. Rock in the top 3 cells is H = 1, then a geometric ramp over
// K(p) = max(4, ceil(ln H_b1 / ln 1.5)) cells to band 1's value, every deeper cell absolute.

const WORLD_SEED = 20251006
const RULES = ECONOMY.planets.surfaceLayer
const MAX_STEP = fromCanonical('1.5')
const ONE = fromCanonical('1')
const CANONICAL_ONE = toCanonical(ONE)

/** The rock tile `depth` whole cells below the surface at the top of column 0. */
function columnTile(params: PlanetParams, depth: number) {
  return { tx: 0, ty: params.radiusTiles - 1 - depth }
}

function rockAt(params: PlanetParams, depth: number): BigStat {
  return hardnessOfTile(params, columnTile(params, depth), GROUND_CELL)
}

/** Rock from the surface down to the first cell of band 2. */
function rockColumn(params: PlanetParams): BigStat[] {
  const column: BigStat[] = []
  for (let depth = 0; bandOfTile(params, 0, columnTile(params, depth).ty) === 1; depth++) {
    column.push(rockAt(params, depth))
  }
  return column
}

/** The rig arriving on planet `p`: the on-curve steps of the planet before (frontier ground). */
function arrivingDrillOn(planetIndex: number): DrillStats {
  return vehicleStatsAt(onCurveSteps(planetIndex - 1))
}

/** Exact drill time of a cell, `60 H^3 / (D min(P, H)^2)` ticks, before any rounding. */
function feltTicks(drill: DrillStats, hardness: BigStat): BigStat {
  return div(tileWorkToBreak(hardness), drillWorkPerTick(drill, hardness))
}

function largestNeighbourRatio(values: readonly BigStat[]): BigStat {
  return values.slice(1).reduce((largest, value, at) => {
    const ratio = div(value, values[at])
    return cmp(ratio, largest) > 0 ? ratio : largest
  }, ONE)
}

/** A registry whose planet 10 is 100 tiles: band 1 is 8 whole cells, too few for its ramp. */
const TINY_PLANET_10: SliceDefinition = {
  id: 'fake',
  register: (r) =>
    r.planetRadius({ id: 'fake.radius', radiusTilesOf: (planet) => (planet === 10 ? 100 : null) }),
}

/** Band-2 rock tiles of the first octant no deeper than `layerCells` below the surface. */
function rampCellsInBandTwo(params: PlanetParams, layerCells: number): TilePoint[] {
  const tiles: TilePoint[] = []
  const shallowest = params.radiusTiles - layerCells
  for (let tx = 0; tx * tx * 2 <= params.radiusTiles * params.radiusTiles; tx++) {
    for (let ty = params.radiusTiles; ty >= tx && ty * ty + tx * tx >= shallowest ** 2; ty--) {
      const isRockInRamp = surfaceRockHardnessAt(params, { tx, ty }) !== null
      if (isRockInRamp && bandOfTile(params, tx, ty) === 2) tiles.push({ tx, ty })
    }
  }
  return tiles
}

function layerOn(planetIndex: number) {
  const layer = surfaceLayerOf(freshPlanetParamsFor(WORLD_SEED, planetIndex))
  if (layer === null) throw new Error(`no surface layer on planet ${planetIndex}`)
  return layer
}

describe('surface layer', () => {
  it('pins the top 3 cells of rock at H = 1 on a fresh planet 2 to 40', () => {
    for (let planet = 2; planet <= 40; planet++) {
      const params = freshPlanetParamsFor(WORLD_SEED, planet)
      const top = [0, 1, 2].map((depth) => toCanonical(rockAt(params, depth)))
      expect(top, `planet ${planet}`).toEqual([CANONICAL_ONE, CANONICAL_ONE, CANONICAL_ONE])
      expect(cmp(rockAt(params, 3), ONE), `planet ${planet}`).toBe(1)
    }
  })

  it('ramps over K(p) = max(4, ceil(ln H_b1 / ln 1.5)) cells: 4 on P2 and P3, 16 on P10, 66 on P40', () => {
    const cells = [2, 3, 4, 10, 40].map((planet) => layerOn(planet).rampCells)
    expect(cells).toEqual([4, 4, 6, 16, 66])
  })

  it('reaches band 1 at the last ramp cell and keeps every deeper band-1 cell absolute', () => {
    for (const planet of [2, 5, 10, 25, 40]) {
      const params = freshPlanetParamsFor(WORLD_SEED, planet)
      const lastRampDepth = RULES.pinnedCells + layerOn(planet).rampCells - 1
      const bandOne = toCanonical(blockHardness(planet, 1))
      const deeper = rockColumn(params).slice(lastRampDepth).map(toCanonical)
      expect(new Set(deeper), `planet ${planet}`).toEqual(new Set([bandOne]))
      expect(cmp(rockAt(params, lastRampDepth - 1), blockHardness(planet, 1))).toBe(-1)
    }
  })

  it('keeps every deeper band at its absolute value: no band is rebased', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 10)
    for (let depth = 60; depth < params.radiusTiles - params.coreRadiusTiles - 1; depth += 37) {
      const band = bandOfTile(params, 0, columnTile(params, depth).ty)
      expect(toCanonical(rockAt(params, depth))).toBe(toCanonical(blockHardness(10, band)))
    }
  })

  it('changes felt cut speed by at most 1.5x a cell down the ramp, on frontier ground P2 to P42', () => {
    for (let planet = 2; planet <= 42; planet++) {
      const drill = arrivingDrillOn(planet)
      const column = rockColumn(freshPlanetParamsFor(WORLD_SEED, planet))
      const felt = column.map((hardness) => feltTicks(drill, hardness))
      const step = largestNeighbourRatio(felt)
      expect(cmp(step, MAX_STEP), `planet ${planet}: ${toCanonical(step)}`).toBeLessThanOrEqual(0)
    }
  })

  it('leaves planet 1 with no layer and its rock at the band value at every depth', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 1)
    expect(params.oreRulesVersion).toBe(2)
    expect(surfaceLayerOf(params)).toBeNull()
    expect(surfaceLayerOf(planetParamsFor(WORLD_SEED, 1, 5))).toBeNull()
    expect(new Set(rockColumn(params).map(toCanonical))).toEqual(new Set([CANONICAL_ONE]))
  })

  it('keeps the shipped band hardness on a planet a save holds under ore rules 4 or earlier', () => {
    for (const rules of [undefined, 2, 4]) {
      const params = planetParamsFor(WORLD_SEED, 10, rules)
      expect(surfaceLayerOf(params)).toBeNull()
      expect(toCanonical(rockAt(params, 0))).toBe(toCanonical(blockHardness(10, 1)))
    }
  })

  it('leaves ore cells at their own tier inside the layer', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 10)
    const cell = oreCell(RESOURCE_FAMILY.metal, 0)
    const hardness = hardnessOfTile(params, columnTile(params, 0), cell)
    expect(toCanonical(hardness)).toBe(toCanonical(oreHardness(oreTier(10, 1))))
  })

  it('caps the ramp at band 1 minus the pinned cells on the ladder, first on planet 43, its step then above 1.5x', () => {
    const capped = Array.from({ length: 60 }, (_, at) => at + 2).filter((planet) => {
      return isRampCapped(layerOn(planet))
    })
    expect(capped[0]).toBe(43)
    const layer = layerOn(43)
    expect(layer.rampCells).toBeLessThan(layer.uncappedRampCells)
    expect(cmp(layer.rampStepRatio, MAX_STEP)).toBe(1)
    expect(cmp(layerOn(42).rampStepRatio, MAX_STEP)).toBeLessThanOrEqual(0)
  })

  it('never shortens the ramp at a registry row radius: it runs on into band 2 (ticket 643)', () => {
    withRegistrations([TINY_PLANET_10], () => {
      const params = freshPlanetParamsFor(WORLD_SEED, 10)
      const layer = layerOn(10)
      expect(params.radiusTiles).toBe(100)
      expect(isRampCapped(layer)).toBe(false)
      expect(isRampPastBandOne(layer)).toBe(true)
      expect(layer.rampCells).toBe(16)
      const softBandTwo = rampCellsInBandTwo(params, layer.pinnedCells + layer.rampCells)
      expect(softBandTwo.length).toBeGreaterThan(0)
      for (const tile of softBandTwo) {
        const hardness = hardnessOfTile(params, tile, GROUND_CELL)
        expect(cmp(hardness, blockHardness(10, 1))).toBe(-1)
      }
    })
  })

  it('keeps the ramp in whole cells from the surface at any radius: the registry radius leaves it as the ladder had it (ticket 643)', () => {
    for (const planet of [2, 5, 10]) {
      const sized = layerOn(planet)
      const ladder = surfaceLayerOf(planetParamsFor(WORLD_SEED, planet, 6))
      expect(sized.hardnessByDepth.map(toCanonical), `planet ${planet}`).toEqual(
        ladder?.hardnessByDepth.map(toCanonical),
      )
    }
  })

  it('keys a harder surface on its solar system row, and a planet row on top of its system', () => {
    const rules: SurfaceLayerRules = {
      ...RULES,
      systems: [
        { system: 1, firstPlanet: 1, surfaceTiers: 0 },
        { system: 2, firstPlanet: 8, surfaceTiers: 6 },
      ],
      planetSurfaces: [{ planet: 5, surfaceTiers: 3, why: 'a valuable planet (fixture)' }],
    }
    const surfaceOn = (planet: number) =>
      buildSurfaceLayer(freshPlanetParamsFor(WORLD_SEED, planet), rules)?.hardnessByDepth[0]
    expect(toCanonical(surfaceOn(4) ?? ONE)).toBe(CANONICAL_ONE)
    expect(toCanonical(surfaceOn(5) ?? ONE)).toBe(toCanonical(oreHardness(4)))
    expect(toCanonical(surfaceOn(9) ?? ONE)).toBe(toCanonical(oreHardness(7)))
  })

  it('lists no planet surface exception yet: the GD confirms any', () => {
    expect(RULES.planetSurfaces).toEqual([])
    expect(RULES.systems).toEqual([{ system: 1, firstPlanet: 1, surfaceTiers: 0 }])
  })
})
