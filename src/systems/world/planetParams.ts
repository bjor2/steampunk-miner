/**
 * `PlanetParams` (decision #4 Generation, formulas from #6 section 2): everything the generator
 * needs for one planet, from one pure `planetParamsFor(worldSeed, planetIndex)`. Planet 1 and
 * planet 2 differ only through these values; the same generator code path makes both.
 * Plain integers, strings and one gravity number, so the params can go into a save header as JSON.
 *
 * `oreRulesVersion` (TD ruling on ticket 445, section 2): the ore rules a planet was entered under.
 * It is an input, never derived: a planet a save holds without it keeps the legacy lead rows, so its
 * unmined chunks never seam against the ones already dug, while a planet entered from this build is
 * stamped. Only planets whose rows differ are stamped (`ORE_RULES_FROM_PLANET`), and the key is
 * omitted when absent, so the params JSON of every legacy planet stays byte-identical. A planet
 * keeps the version it was stamped with: version 1 never gains what version 2 added.
 *
 * From ore rules 3 and planet 3 (ticket 448) a planet's ore follows the depth density curve: its
 * `oreDensityBp` are the curve's band means, its patch lattice stays the one the step-band rows
 * lay (`patchLatticeDensityBp`, present only there) and each patch is thinned to the curve at its
 * centre (`orePatches.ts`).
 *
 * From ore rules 7 (ticket 643, GD lock R2 on #302) a planet's radius is its planet registry row's
 * (`registries/planetRow.ts`, the rows of ticket 642, keyed by the ore rules they size from), and
 * the core, the bands and every depth placed by band follow it. A planet with no row, and every planet stamped earlier, keeps #6's
 * ladder (`radiusForPlanet`), so a save never regenerates and the ladder stays a versioned path.
 *
 * From ore rules 8 (ticket 652, spec #647) planets 2 to 5 hold their registry row's hazard pockets
 * (`registries/hazardPockets.ts`): a read of the planet and the cell, never a repaint, so the cells
 * stay byte-identical, while a planet a save holds under rules 7 or earlier meets no pocket.
 *
 * From ore rules 10 (ticket 737, Bjor's deep-rares rule) every planet grows its rare, epic and
 * mythic ore as seeded clusters of 1 to 3 cells instead of whole patches, and holds one guaranteed
 * cluster of each rare kind its roster names (`rareClusters.ts`, `guaranteedClusters.ts`).
 *
 * From ore rules 11 (ticket 738, the same rule) a planet from P3 draws its rare, epic and mythic ore
 * only from band 3 (`d >= 0.35`), weighted toward the core: the `ores` slice's deep rarity rows.
 */
import { hashCell } from '../cellRandom'
import { ECONOMY } from '../economy/economy'
import { refineryUnlockPlanet } from '../economy/refineryEconomy'
import { rowRadiusTilesOf } from '../registries/planetRow'
import { BAY_IDS, SLICE_BAY_IDS, type BayId } from './dockBays'
import {
  ARTEFACT_CACHE_BANDS,
  BAND_START_DEPTH_PERCENT,
  CAVE_THRESHOLD_BP,
  CORE_RADIUS_DIVISOR,
  CORE_RADIUS_MAX_TILES,
  CORE_RADIUS_MIN_TILES,
  DOCK_CLEARANCE_TILES,
  DEPTH_CURVE_PATCH_SEED_CHANCE_BP,
  DOCK_COUNTER_BUILDING_PLANETS,
  ORE_DENSITY_BP,
  PATCH_MEAN_CELLS,
  PAD_COLUMNS_PER_COUNTER_BUILDING,
  PAD_FIRST_COLUMN,
  PAD_LAST_COLUMN_BASE,
  PATCH_SEED_CHANCE_BP,
  RADIUS_BASE_TILES,
  RADIUS_GROWTH_TILES,
  RADIUS_HALF_GROWTH_PLANETS,
} from './planetTable'
import { planetArchetypeOf } from './planetArchetype'

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
  /** The ore rules the planet was entered under; absent means the legacy rows (ticket 445). */
  oreRulesVersion?: number
  /**
   * Under the depth density curve only (ticket 448): the step-band rows the patch lattice is laid
   * on, each patch then thinned by `rho(d_centre)` over its band's entry. Absent elsewhere, where
   * the lattice is laid on `oreDensityBp` and every patch fires at `patchSeedChanceBp`.
   */
  patchLatticeDensityBp?: readonly number[]
}

/**
 * The newest ore rules: 1 is the rarity rows (ticket 445), 2 adds the material roster, a kind slot
 * per ore patch (ticket 446), 3 the depth density curve from planet 3 (ticket 448), 4 the mixed
 * kinds table's roster from planet 3 (#453), 5 the pinned surface layer from planet 2 (ticket 625),
 * 6 planet 2's own species pool on the legacy kind slots (ticket 632), 7 the planet registry's radius
 * from planet 2 (ticket 643), 8 the planet registry's hazard pockets from planet 2 (ticket 652), 9
 * P2's own three kinds after the legacy slots (ticket 709), 10 the rare-ore clusters on every
 * planet (ticket 737), 11 the rare windows from band 3 on from planet 3 (ticket 738). The stamp
 * records the ground rules a planet was entered under, its rock's hardness, its species pool and
 * its size with them.
 */
export const ORE_RULES_VERSION = 11

/** The ore rules that add the depth density curve (ticket 448). */
export const DEPTH_CURVE_ORE_RULES = 3

/** The ore rules that pin the surface layer and ramp it to band 1 (ticket 625). */
export const SURFACE_LAYER_ORE_RULES = 5

/** Planet 1's band 1 is already as soft as the surface, so the layer first changes planet 2. */
const SURFACE_LAYER_FIRST_PLANET = 2

/** Planet 1 keeps the legacy pool byte-for-byte, so P2's own pool first changes planet 2 (632). */
const P2_SPECIES_POOL_FIRST_PLANET = 2

/**
 * The ore rules that read the planet's radius from its registry row (ticket 643): the earliest a
 * row's frozen radius may key on (`registries/planetRow.ts`), so a planet stamped before keeps the
 * ladder.
 */
export const RADIUS_ROWS_ORE_RULES = 7

/** Planet 1's row is the ladder's 300 tiles, so the registry radius first changes planet 2. */
const RADIUS_ROWS_FIRST_PLANET = 2

/** The ore rules that hold each planet's hazard pockets (ticket 652). */
export const HAZARD_POCKET_ORE_RULES = 8

/** Planet 1 holds no hazard and stays byte-identical, so the pockets first change planet 2 (651). */
const HAZARD_POCKET_FIRST_PLANET = 2

/** The ore rules that add P2's own kinds, Cinnabar, Aquamarine and Jet (ticket 709). */
export const P2_OWN_KINDS_ORE_RULES = 9

/** Only P2's pool owns kinds, so P1 stays byte-identical and P3 on draw as before (ticket 709). */
const P2_OWN_KINDS_FIRST_PLANET = 2

/** The ore rules that grow rare ore in clusters of 1 to 3 cells (ticket 737). */
export const RARE_CLUSTER_ORE_RULES = 10

/** Bjor's deep-rares rule holds on every planet (GD lock on ticket 737), so it starts at planet 1. */
const RARE_CLUSTER_FIRST_PLANET = 1

/** The ore rules that draw rare, epic and mythic ore only from band 3 on (ticket 738). */
export const DEEP_RARE_WINDOW_ORE_RULES = 11

/**
 * P1 and P2's legacy rows already start rare at band 3, so the deep window first changes planet 3,
 * where the `ores` slice's mixed rows start (ticket 738).
 */
const DEEP_RARE_WINDOW_FIRST_PLANET = 3

/**
 * The first planet each ore rules version changes, version 1 first: the rarity rows from P3 (the
 * `ores` slice's `mixedRowsFromPlanet`), the roster from P1 (TD ruling on ticket 446, section 4),
 * the depth curve from its `fromPlanet` (GD on ticket 448: P1 and P2 keep the step bands), the
 * mixed roster where the mixed rows start (#453: P1 and P2 keep the legacy roster), the surface
 * layer from planet 2 (ticket 625: P1 stays byte-identical), P2's species pool (ticket 632, the
 * `ores` slice's `poolsBeforeOreRules`: an older P2 keeps the legacy species), the registry radius
 * from planet 2 (ticket 643: P1's row is its ladder radius), the hazard pockets from planet 2
 * (ticket 652: P1 holds no hazard), P2's own kinds (ticket 709: the `ores` slice's own slots name
 * P2's pool alone, so P3 on draw the kinds they drew), the rare clusters from planet 1 (ticket 737),
 * the deep rare window from planet 3 (ticket 738: P1 and P2 draw rare from band 3 already).
 */
const ORE_RULES_FIRST_PLANETS: readonly number[] = [
  3,
  1,
  ECONOMY.planets.depthDensity.fromPlanet,
  3,
  SURFACE_LAYER_FIRST_PLANET,
  P2_SPECIES_POOL_FIRST_PLANET,
  RADIUS_ROWS_FIRST_PLANET,
  HAZARD_POCKET_FIRST_PLANET,
  P2_OWN_KINDS_FIRST_PLANET,
  RARE_CLUSTER_FIRST_PLANET,
  DEEP_RARE_WINDOW_FIRST_PLANET,
]

/** The first planet any ore rules change, so the first a fresh session stamps: planet 1. */
export const ORE_RULES_FROM_PLANET = Math.min(...ORE_RULES_FIRST_PLANETS)

const KNOWN_ORE_RULES_VERSIONS: readonly unknown[] = Array.from(
  { length: ORE_RULES_VERSION },
  (_, at) => at + 1,
)
const TWO_TO_32 = 0x100000000
const FIRST_PLANET = 1

export function planetParamsFor(
  worldSeed: number,
  planetIndex: number,
  oreRulesVersion?: number,
): PlanetParams {
  assertValidWorldSeed(worldSeed)
  assertValidPlanetIndex(planetIndex)
  assertValidOreRulesVersion(oreRulesVersion)
  const radiusTiles = radiusTilesUnder(planetIndex, oreRulesVersion)
  return {
    worldSeed,
    planetIndex,
    planetSeed: planetSeedFor(worldSeed, planetIndex),
    radiusTiles,
    coreRadiusTiles: coreRadiusFor(radiusTiles),
    bandStartsHalfTileSq: bandStartsFor(radiusTiles),
    oreDensityBp: oreDensityBpOf(planetIndex, oreRulesVersion),
    patchMeanCells: PATCH_MEAN_CELLS,
    patchSeedChanceBp: patchSeedChanceBpOf(planetIndex, oreRulesVersion),
    caveThresholdBp: CAVE_THRESHOLD_BP,
    padFirstColumn: PAD_FIRST_COLUMN,
    padLastColumn: padLastColumnOf(planetIndex),
    dockClearanceTiles: DOCK_CLEARANCE_TILES,
    dockBays: dockBaysOf(planetIndex),
    ...planetArchetypeOf(planetIndex),
    hasStarterVein: planetIndex === FIRST_PLANET,
    artefactCacheBand: artefactCacheBandOf(planetIndex),
    ...(oreRulesVersion === undefined ? {} : { oreRulesVersion }),
    ...(isDepthCurvePlanet(planetIndex, oreRulesVersion)
      ? { patchLatticeDensityBp: ORE_DENSITY_BP }
      : {}),
  }
}

/**
 * The ore rules a planet entered now is stamped with: the newest version that changes it, none
 * before `ORE_RULES_FROM_PLANET`. Planet 1 stayed on rules 2, which the curve, the surface layer,
 * P2's pool, the registry radius, the hazard pockets and P2's own kinds leave as they were (tickets
 * 448, 625, 632, 643, 652, 709); the rare clusters change it, so it is stamped 10 (ticket 737).
 * Planet 2 is stamped 10 too, and planet 3 on 11 (ticket 738).
 */
export function oreRulesVersionOnEntry(planetIndex: number): number | undefined {
  const changing = ORE_RULES_FIRST_PLANETS.map((first, at) => (planetIndex >= first ? at + 1 : 0))
  const newest = Math.max(...changing)
  return newest === 0 ? undefined : newest
}

/** Whether a planet's ore follows the depth density curve: rules 3 or later, from its first planet. */
export function isDepthCurvePlanet(
  planetIndex: number,
  oreRulesVersion: number | undefined,
): boolean {
  const isUnderCurveRules = (oreRulesVersion ?? 0) >= DEPTH_CURVE_ORE_RULES
  return isUnderCurveRules && planetIndex >= ECONOMY.planets.depthDensity.fromPlanet
}

/** Whether a planet may hold hazard pockets (ticket 652): rules 8 or later, from planet 2. */
export function isHazardPocketPlanet(params: PlanetParams): boolean {
  const isUnderPocketRules = (params.oreRulesVersion ?? 0) >= HAZARD_POCKET_ORE_RULES
  return isUnderPocketRules && params.planetIndex >= HAZARD_POCKET_FIRST_PLANET
}

/** Whether a planet grows its rare ore in clusters of 1 to 3 cells (ticket 737): rules 10 or later. */
export function isRareClusterPlanet(params: PlanetParams): boolean {
  return (params.oreRulesVersion ?? 0) >= RARE_CLUSTER_ORE_RULES
}

/** Whether a planet's rock follows the pinned surface layer (ticket 625): rules 5 or later. */
export function isSurfaceLayerPlanet(params: PlanetParams): boolean {
  return (params.oreRulesVersion ?? 0) >= SURFACE_LAYER_ORE_RULES
}

function oreDensityBpOf(planetIndex: number, oreRulesVersion: number | undefined) {
  const isCurve = isDepthCurvePlanet(planetIndex, oreRulesVersion)
  return isCurve ? ECONOMY.planets.depthDensity.bandMeanBp : ORE_DENSITY_BP
}

function patchSeedChanceBpOf(planetIndex: number, oreRulesVersion: number | undefined) {
  const isCurve = isDepthCurvePlanet(planetIndex, oreRulesVersion)
  return isCurve ? DEPTH_CURVE_PATCH_SEED_CHANCE_BP : PATCH_SEED_CHANCE_BP
}

/**
 * The params of a planet as this build enters it fresh (travel, a new game, a scenario): what a
 * model of a new planet reads, so a report or the bot sees the cells the session generates.
 */
export function freshPlanetParamsFor(worldSeed: number, planetIndex: number): PlanetParams {
  return planetParamsFor(worldSeed, planetIndex, oreRulesVersionOnEntry(planetIndex))
}

/**
 * Whether two params generate the same cells: one seed, one index and one set of ore rules. A cache
 * keyed on the seed and index alone would hand a stamped planet the legacy planet's cells.
 */
export function isSameGeneratedPlanet(a: PlanetParams, b: PlanetParams): boolean {
  return (
    a.worldSeed === b.worldSeed &&
    a.planetIndex === b.planetIndex &&
    a.oreRulesVersion === b.oreRulesVersion
  )
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

/**
 * The planet's radius in tiles under its ore rules: from rules 7 its registry row's (ticket 643),
 * #6's ladder for a planet with no row and for every planet stamped earlier.
 */
export function radiusTilesUnder(planetIndex: number, oreRulesVersion: number | undefined): number {
  return registryRadiusOf(planetIndex, oreRulesVersion) ?? radiusForPlanet(planetIndex)
}

/** Whether the planet is sized by its registry row: ore rules 7 or later and a row to read. */
export function isRegistrySizedPlanet(params: PlanetParams): boolean {
  return registryRadiusOf(params.planetIndex, params.oreRulesVersion) !== null
}

/**
 * A planet stamped before rules 7 never asks the registry, and neither does planet 1, whose row is
 * the ladder's 300 tiles: the import-time planet 1, stamped with the rare clusters' rules 10
 * (ticket 737), needs no slice.
 */
function registryRadiusOf(planetIndex: number, oreRulesVersion: number | undefined) {
  const isRegistryRadius =
    (oreRulesVersion ?? 0) >= RADIUS_ROWS_ORE_RULES && planetIndex >= RADIUS_ROWS_FIRST_PLANET
  return isRegistryRadius ? rowRadiusTilesOf(planetIndex, oreRulesVersion) : null
}

/** The radius of the planet as this build enters it fresh: what a model of a new planet reads. */
export function freshRadiusTilesOf(planetIndex: number): number {
  return radiusTilesUnder(planetIndex, oreRulesVersionOnEntry(planetIndex))
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
export function bandStartsFor(radiusTiles: number): number[] {
  return BAND_START_DEPTH_PERCENT.map((percent) => {
    const scaled = 2 * radiusTiles * (100 - percent)
    const squared = scaled * scaled
    return (squared - (squared % 10000)) / 10000
  })
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

/** Absent (legacy), or a version this build knows: a later one is another build's world. */
export function isKnownOreRulesVersion(version: unknown): boolean {
  return version === undefined || KNOWN_ORE_RULES_VERSIONS.includes(version)
}

function assertValidOreRulesVersion(oreRulesVersion: number | undefined): void {
  if (!isKnownOreRulesVersion(oreRulesVersion)) {
    throw new RangeError(
      `oreRulesVersion must be 1 to ${ORE_RULES_VERSION}, got ${oreRulesVersion}`,
    )
  }
}

function assertValidPlanetIndex(planetIndex: number): void {
  if (!Number.isSafeInteger(planetIndex) || planetIndex < FIRST_PLANET) {
    throw new RangeError(`planetIndex must be a safe integer >= 1, got ${planetIndex}`)
  }
}
