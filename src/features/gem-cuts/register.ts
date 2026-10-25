/**
 * The gem-cuts slice (ticket 889 under #878): the append-only Blender gem-cut library, its seeded
 * picks and the planet overlay pick, pure data and rules. It registers the library's atlas pages as
 * art (#214), so the manifest lint and the export know their ids. No command, event, log line, save
 * section or generation hook. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { gemCutsDebugActions } from './debug'
import { gemCutArtAssets } from './systems/gemCutLibrary'

export const slice: SliceDefinition = {
  id: 'gem-cuts',
  register(r) {
    // One `atlas` asset per page of the library, under public/assets/ground/.
    r.artAssets(gemCutArtAssets())
    // steampunkDebug.features['gem-cuts'].cutsOf('1', '6', worldSeed): read-only.
    r.debugActions(gemCutsDebugActions)
  },
}
