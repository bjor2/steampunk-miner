/**
 * The per-act hero atlas drawn now (ticket 451), for the look table and the debug reads that check
 * it in e2e: whether the probe gave the atlas the 16th unit, which act's atlas is resident and its
 * cells, and how many times one was bound (a planet change inside an act binds none). Written only
 * by `terrainHeroAtlas`; a mutable registry, never React or the store. Presentation only.
 */
import type { HeroAtlasUnit } from '../systems/render/gpuTier'

/** No atlas bound. */
export const NO_HERO_ATLAS_CELLS: readonly string[] = []

export const heroAtlasPresence: {
  unit: HeroAtlasUnit
  /** The act whose atlas is bound, or null: every hero draws the shader look. */
  residentId: string | null
  /** The resident atlas's species by cell; a new array only when another atlas is bound. */
  cells: readonly string[]
  binds: number
  /** The last atlas refused because the GPU would hold it uncompressed. */
  refusedId: string | null
} = {
  unit: 'absent',
  residentId: null,
  cells: NO_HERO_ATLAS_CELLS,
  binds: 0,
  refusedId: null,
}
