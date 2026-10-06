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
  /** The archetype id the scenario validator knows (#10 registered ids). */
  archetypeId: string
  /** Radial gravity multiplier (#4, #7); planet 2 is 1.25 (#6 section 2), never above 1.4. */
  gravityMultiplier: number
  /** Art palette for the five bands (#13); a placeholder id until the art lands. */
  paletteId: string
  /** Relative weights of the metal and crystal families when ore is placed (#2, #4). */
  familyWeights: { metal: number; crystal: number }
}

/** Planet 1 (`archetype.base`), then planet 2 (`archetype.heavy`, #10). Planets past the slice reuse the last entry until #2 adds more. */
export const PLANET_ARCHETYPES: readonly PlanetArchetype[] = [
  {
    archetypeId: 'archetype.base',
    gravityMultiplier: 1,
    paletteId: 'palette.planet_1',
    familyWeights: { metal: 3, crystal: 1 },
  },
  {
    archetypeId: 'archetype.heavy',
    // 1.25 as a whole-number ratio, so the economy scan never mistakes it for a price ratio.
    gravityMultiplier: 5 / 4,
    paletteId: 'palette.planet_2',
    familyWeights: { metal: 1, crystal: 2 },
  },
]

/**
 * The heat planets of the Fire act (#113, the `heat` block of economy.json `archetypes`): the heavy
 * planet's gravity and ore families under `palette.heat` (#114), with lava pockets in the ground.
 * Nothing but the palette and the pockets is decided for them, so the rest stays as it was.
 */
export const HEAT_PLANET_ARCHETYPE: PlanetArchetype = {
  ...PLANET_ARCHETYPES[PLANET_ARCHETYPES.length - 1],
  archetypeId: 'archetype.heat',
  paletteId: 'palette.heat',
}

/** Depth bands start at these percents of the way to the centre (#4 Geometry, #6 section 1). */
export const BAND_START_DEPTH_PERCENT: readonly number[] = [8, 35, 65, 90]

/** Ore tiles per drilled tile in bands 1 to 5, in basis points (#6 section 1: 0.10 ... 0.22). */
export const ORE_DENSITY_BP: readonly number[] = [1000, 1400, 1800, 2000, 2200]

/** Mean tiles per ore patch in bands 1 to 5 (#42 `patchMeanCells`; cheap to retune). */
export const PATCH_MEAN_CELLS: readonly number[] = [12, 16, 20, 24, 28]

/**
 * Chance that a band's lattice node fires a patch, in basis points (#42 `seedProb`): solved once
 * so the painted ore fraction of planets 1 and 2 matches `ORE_DENSITY_BP` after clipping by
 * band edges, caves and the core. Locked by the golden digest and the patch density test.
 */
export const PATCH_SEED_CHANCE_BP: readonly number[] = [8420, 8870, 8980, 8220, 8800]

/** The cone under the dock is this wide at mid-band-1 depth (#42 dock guarantee; cheap to retune). */
export const DOCK_CONE_WIDTH_AT_MID_TILES = 16

/**
 * Cave noise above this level (basis points of the noise range) is open air, in bands 2 to 5
 * only, so the surface band stays whole and #9's crawlers have caves to live in. Placeholder.
 */
export const CAVE_THRESHOLD_BP = 7500

/** 8 tiles of cleared air above the dock pad (#4, #8). */
export const DOCK_CLEARANCE_TILES = 8

/**
 * The dock pad's span in tiles from the dock point (#170): it follows the shop buildings' art, not
 * the bay zones, so it is data. It starts at -8 on every planet and ends at +12 on planets 1 to 9;
 * each counter building the planet holds (#170 amendment, TD 6 Oct) adds 6 columns east, at the
 * planet of its locked schedule row (`docs/scaling/horizontal/stats.json`): merchants P10, quest
 * office P28, core forge P38. The pad belongs to the planet, never to the player's unlocks.
 */
export const PAD_FIRST_COLUMN = -8
export const PAD_LAST_COLUMN_BASE = 12
export const PAD_COLUMNS_PER_COUNTER_BUILDING = 6
export const DOCK_COUNTER_BUILDING_PLANETS: readonly number[] = [10, 28, 38]

/**
 * The bay zones on the pad (#37, moved under the buildings by #170): each zone is 4 tiles wide
 * around its centre column. The Sell zone (Assay & Exchange) is centred 5 tiles left of the dock
 * point, on the spawn side, so the first dock and the tow still land there; the Upgrade zone
 * (Engineering Works) 7 tiles right of it, on the turntable. The yard between them docks nowhere.
 */
export const SELL_BAY_CENTRE_OFFSET_TILES = 5
export const UPGRADE_BAY_CENTRE_OFFSET_TILES = 7
export const BAY_HALF_WIDTH_TILES = 2

/**
 * The Refinery (#105) stands behind the yard (#170): from its unlock planet the yard's columns
 * -2 to +1, centred on the dock point, are its zone, under its intake pipe. The pad is the same.
 */
export const REFINERY_BAY_CENTRE_OFFSET_TILES = 0

/** Radius formula (#6 section 2): `300 + floor(700*(p-1) / ((p-1) + 6))`. */
export const RADIUS_BASE_TILES = 300
export const RADIUS_GROWTH_TILES = 700
export const RADIUS_HALF_GROWTH_PLANETS = 6

/** Core radius formula (#6 section 2, #4 Producer note): `min(10, max(4, R // 40))`. */
export const CORE_RADIUS_MIN_TILES = 4
export const CORE_RADIUS_MAX_TILES = 10
export const CORE_RADIUS_DIVISOR = 40

/**
 * The depth band of each planet's artefact cache (#46: band 3 on planet 1, band 2 on planet 2);
 * planets past the slice reuse the last entry, like the archetypes.
 */
export const ARTEFACT_CACHE_BANDS: readonly number[] = [3, 2]

/** The starter vein is placed on planet 1 within this many tiles of the dock (#16). */
export const STARTER_ZONE_RADIUS_TILES = 15
