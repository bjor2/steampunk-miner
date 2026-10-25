/**
 * The mineral skins slice (ticket 591 under #576): the skin table and its generator, pure data and
 * rules. It registers the pages of the per-act hero atlases (tickets 451 and 852), so the manifest
 * lint and the export know their ids. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { heroAtlasArtAssets } from './systems/heroAtlases'

export const slice: SliceDefinition = {
  id: 'mineral-skins',
  register(r) {
    // One `atlas` asset per page of each act with heroes, under public/assets/ground/ (#214).
    // No command, event, log line, save section or generation hook.
    r.artAssets(heroAtlasArtAssets())
  },
}
