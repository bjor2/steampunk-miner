/**
 * The per-act hero atlas drawn now (ticket 451), for the look table and the debug reads that check
 * it in e2e: whether the probe gave the atlas the 16th unit, which act's atlas is resident, how many
 * of its pages are bound as layers (ticket 852) and each species' act-wide cell on them, and how
 * many times one was bound (a planet change inside an act binds none). Written only by
 * `terrainHeroAtlas`; a mutable registry, never React or the store. Presentation only.
 */
import type { HeroAtlasUnit } from '../systems/render/gpuTier'

/** No atlas bound. */
export const NO_HERO_CELLS_BOUND: ReadonlyMap<string, number> = new Map()

export const heroAtlasPresence: {
  unit: HeroAtlasUnit
  /** The act whose atlas is bound, or null: every hero draws the shader look. */
  residentId: string | null
  /** The bound layers, one per page; 0 with none bound. */
  pages: number
  /** The resident pages' species by act-wide cell; a new map only when another atlas is bound. */
  heroCells: ReadonlyMap<string, number>
  binds: number
  /** The last atlas refused because the GPU would hold it uncompressed. */
  refusedId: string | null
} = {
  unit: 'absent',
  residentId: null,
  pages: 0,
  heroCells: NO_HERO_CELLS_BOUND,
  binds: 0,
  refusedId: null,
}
