/**
 * The materials slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 444 shipped the data layer only (the table, its loader and guards); the roster draws the
 * rows into the ground and hands the shader their looks. The slice registers the per-act hero
 * atlases' art (ticket 451), so the manifest lint and the export know their ids.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { heroAtlasArtAssets } from './systems/render/heroAtlases'

export const slice: SliceDefinition = {
  id: 'materials',
  register(r) {
    // One `atlas` asset per act with heroes, under public/assets/ground/ (#214).
    r.artAssets(heroAtlasArtAssets())
  },
}
