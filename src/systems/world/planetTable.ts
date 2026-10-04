/**
 * Per-planet generator data (decision #4 `PlanetParams`, #2: planet 2 differs only by gravity,
 * palette and resource weights). Formulas (radius, core radius, bands) live in `planetParams.ts`;
 * this file holds the numbers that are data, each with its source.
 *
 * PLACEHOLDERS, owned by the Planet designer (#4, #13): the palette ids, the family weights and
 * the cave threshold are not fixed by any decision yet. They are written here so the generator is
 * complete; changing one changes generator output, so it needs a GENERATOR_VERSION bump.
 */

export interface PlanetArchetype {
  /** Radial gravity multiplier (#4, #7); planet 2 is 1.25 (#6 section 2), never above 1.4. */
  gravityMultiplier: number
  /** Art palette for the five bands (#13); a placeholder id until the art lands. */
  paletteId: string
  /** Relative weights of the metal and crystal families when ore is placed (#2, #4). */
  familyWeights: { metal: number; crystal: number }
}

/** Planet 1, then planet 2. Planets past the slice reuse the last entry until #2 adds more. */
export const PLANET_ARCHETYPES: readonly PlanetArchetype[] = [
  { gravityMultiplier: 1, paletteId: 'palette.planet_1', familyWeights: { metal: 3, crystal: 1 } },
  {
    gravityMultiplier: 1.25,
    paletteId: 'palette.planet_2',
    familyWeights: { metal: 1, crystal: 2 },
  },
]

/** Depth bands start at these percents of the way to the centre (#4 Geometry, #6 section 1). */
export const BAND_START_DEPTH_PERCENT: readonly number[] = [8, 35, 65, 90]

/** Ore tiles per drilled tile in bands 1 to 5, in basis points (#6 section 1: 0.10 ... 0.22). */
export const ORE_DENSITY_BP: readonly number[] = [1000, 1400, 1800, 2000, 2200]

/**
 * Cave noise above this level (basis points of the noise range) is open air, in bands 2 to 5
 * only, so the surface band stays whole and #9's crawlers have caves to live in. Placeholder.
 */
export const CAVE_THRESHOLD_BP = 7500

/** The dock pad is 12 tiles wide with 8 tiles of cleared air above it (#4, #8). */
export const DOCK_HALF_WIDTH_TILES = 6
export const DOCK_CLEARANCE_TILES = 8

/** Radius formula (#6 section 2): `300 + floor(700*(p-1) / ((p-1) + 6))`. */
export const RADIUS_BASE_TILES = 300
export const RADIUS_GROWTH_TILES = 700
export const RADIUS_HALF_GROWTH_PLANETS = 6

/** Core radius formula (#6 section 2, #4 Producer note): `min(10, max(4, R // 40))`. */
export const CORE_RADIUS_MIN_TILES = 4
export const CORE_RADIUS_MAX_TILES = 10
export const CORE_RADIUS_DIVISOR = 40

/** The starter vein is placed on planet 1 within this many tiles of the dock (#16). */
export const STARTER_ZONE_RADIUS_TILES = 15
