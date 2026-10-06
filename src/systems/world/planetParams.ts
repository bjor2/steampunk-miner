/**
 * `PlanetParams` (decision #4 Generation, formulas from #6 section 2): everything the generator
 * needs for one planet, from one pure `planetParamsFor(worldSeed, planetIndex)`. Planet 1 and
 * planet 2 differ only through these values; the same generator code path makes both.
 * Plain integers, strings and one gravity number, so the params can go into a save header as JSON.
 */
import { hashCell } from '../cellRandom'
import { isHeatPlanet } from '../economy/heatEconomy'
import { refineryUnlockPlanet } from '../economy/refineryEconomy'
import { BAY_IDS, SLICE_BAY_IDS, type BayId } from './dockBays'
import {
  ARTEFACT_CACHE_BANDS,
  BAND_START_DEPTH_PERCENT,
  CAVE_THRESHOLD_BP,
  CORE_RADIUS_DIVISOR,
  CORE_RADIUS_MAX_TILES,
  CORE_RADIUS_MIN_TILES,
  DOCK_CLEARANCE_TILES,
  DOCK_COUNTER_BUILDING_PLANETS,
  HEAT_PLANET_ARCHETYPE,
  ORE_DENSITY_BP,
  PATCH_MEAN_CELLS,
  PAD_COLUMNS_PER_COUNTER_BUILDING,
  PAD_FIRST_COLUMN,
  PAD_LAST_COLUMN_BASE,
  PATCH_SEED_CHANCE_BP,
  PLANET_ARCHETYPES,
  RADIUS_BASE_TILES,
  RADIUS_GROWTH_TILES,
  RADIUS_HALF_GROWTH_PLANETS,
  type PlanetArchetype,
} from './planetTable'

export interface PlanetParams {
  worldSeed: number
  planetIndex: number
  /** `hash(worldSeed, planetIndex)`; every generator sub-seed derives from it (#4). */
  planetSeed: number
  radiusTiles: number
  coreRadiusTiles: number
  /**
   * Inner edges of bands 2 to 5 as squared half-tile radii: a tile whose `halfTileDistanceSq`
   * is at most `bandStartsHalfTileSq[i]` is in band `i + 2` or deeper. Integer, so band
   * membership needs no floating point (#4).
   */
  bandStartsHalfTileSq: readonly number[]
  /** Expected ore tiles per solid non-core tile of bands 1..5, in basis points (#6, #42). */
  oreDensityBp: readonly number[]
  /** Mean tiles per ore patch in bands 1..5 (#42). */
  patchMeanCells: readonly number[]
  /** Chance a band's patch lattice node fires, in basis points (#42 `seedProb`). */
  patchSeedChanceBp: readonly number[]
  caveThresholdBp: number
  /** The dock pad's columns from the dock point (#170): -8 to +12, growing east from P10. */
  padFirstColumn: number
  padLastColumn: number
  dockClearanceTiles: number
  /** The platform's bays here: the Sell and Upgrade bays, and the Refinery bay from P3 (#105). */
  dockBays: readonly BayId[]
  /** `archetype.base` on planet 1, `archetype.heavy` on planet 2 (#10), `archetype.heat` on 8-16 (#113). */
  archetypeId: string
  gravityMultiplier: number
  paletteId: string
  familyWeights: { metal: number; crystal: number }
  /** Planet 1 gets the guaranteed early ore of #16. */
  hasStarterVein: boolean
  /** The band the planet's one artefact cache sits in (#46). */
  artefactCacheBand: number
}

const TWO_TO_32 = 0x100000000
const FIRST_PLANET = 1

export function planetParamsFor(worldSeed: number, planetIndex: number): PlanetParams {
  assertValidWorldSeed(worldSeed)
  assertValidPlanetIndex(planetIndex)
  const radiusTiles = radiusForPlanet(planetIndex)
  return {
    worldSeed,
    planetIndex,
    planetSeed: planetSeedFor(worldSeed, planetIndex),
    radiusTiles,
    coreRadiusTiles: coreRadiusFor(radiusTiles),
    bandStartsHalfTileSq: bandStartsFor(radiusTiles),
    oreDensityBp: ORE_DENSITY_BP,
    patchMeanCells: PATCH_MEAN_CELLS,
    patchSeedChanceBp: PATCH_SEED_CHANCE_BP,
    caveThresholdBp: CAVE_THRESHOLD_BP,
    padFirstColumn: PAD_FIRST_COLUMN,
    padLastColumn: padLastColumnOf(planetIndex),
    dockClearanceTiles: DOCK_CLEARANCE_TILES,
    dockBays: dockBaysOf(planetIndex),
    ...archetypeOf(planetIndex),
    hasStarterVein: planetIndex === FIRST_PLANET,
    artefactCacheBand: artefactCacheBandOf(planetIndex),
  }
}

/** The platform travels forward only, so it has the Refinery bay on every planet from its unlock. */
function dockBaysOf(planetIndex: number): readonly BayId[] {
  return planetIndex >= refineryUnlockPlanet() ? BAY_IDS : SLICE_BAY_IDS
}

/** `12 + 6 * n`, n the counter buildings whose planet this is or is past (#170 amendment). */
export function padLastColumnOf(planetIndex: number): number {
  const counters = DOCK_COUNTER_BUILDING_PLANETS.filter((planet) => planet <= planetIndex).length
  return PAD_LAST_COLUMN_BASE + PAD_COLUMNS_PER_COUNTER_BUILDING * counters
}

/** #6 section 2: 300 on planet 1, 400 on planet 2, approaching 1000. */
export function radiusForPlanet(planetIndex: number): number {
  const planetsAfterFirst = planetIndex - FIRST_PLANET
  return (
    RADIUS_BASE_TILES +
    Math.floor(
      (RADIUS_GROWTH_TILES * planetsAfterFirst) / (planetsAfterFirst + RADIUS_HALF_GROWTH_PLANETS),
    )
  )
}

/** #6 section 2 as amended on #4: `min(10, max(4, R // 40))`. */
export function coreRadiusFor(radiusTiles: number): number {
  return Math.min(
    CORE_RADIUS_MAX_TILES,
    Math.max(CORE_RADIUS_MIN_TILES, Math.floor(radiusTiles / CORE_RADIUS_DIVISOR)),
  )
}

/** Mixes the high and low 32 bits of the index, so any safe-integer planet has its own seed (#4). */
export function planetSeedFor(worldSeed: number, planetIndex: number): number {
  return hashCell(worldSeed, planetIndex % TWO_TO_32, Math.floor(planetIndex / TWO_TO_32))
}

/**
 * A band starting at `percent` of the depth has radius `R * (100 - percent) / 100`; as a squared
 * half-tile radius that is `(2R(100 - percent))^2 / 10000`, floored exactly in integers.
 */
function bandStartsFor(radiusTiles: number): number[] {
  return BAND_START_DEPTH_PERCENT.map((percent) => {
    const scaled = 2 * radiusTiles * (100 - percent)
    const squared = scaled * scaled
    return (squared - (squared % 10000)) / 10000
  })
}

/** A heat planet of the Fire act takes the heat archetype; the others the slice's list (#10). */
function archetypeOf(planetIndex: number): PlanetArchetype {
  if (isHeatPlanet(planetIndex)) return HEAT_PLANET_ARCHETYPE
  const last = PLANET_ARCHETYPES.length - 1
  return PLANET_ARCHETYPES[Math.min(planetIndex - FIRST_PLANET, last)]
}

function artefactCacheBandOf(planetIndex: number): number {
  const last = ARTEFACT_CACHE_BANDS.length - 1
  return ARTEFACT_CACHE_BANDS[Math.min(planetIndex - FIRST_PLANET, last)]
}

function assertValidWorldSeed(worldSeed: number): void {
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed >= TWO_TO_32) {
    throw new RangeError(`worldSeed must be a uint32, got ${worldSeed}`)
  }
}

function assertValidPlanetIndex(planetIndex: number): void {
  if (!Number.isSafeInteger(planetIndex) || planetIndex < FIRST_PLANET) {
    throw new RangeError(`planetIndex must be a safe integer >= 1, got ${planetIndex}`)
  }
}
