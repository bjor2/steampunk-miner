/**
 * The roster slice's registration: no side effects at import; the loader calls `register`.
 *
 * The roster fold draws each ore patch's material kind (`generationHook` `roster.materials`, which
 * writes the cell's kind slot: GENERATOR_VERSION 10, ticket 446). It sorts after `ores.lead` and
 * `planet-mix.mix`, so it reads the final family and tier and changes neither. Its debug action
 * reads ticket 449's share table for `npm run rarity:shares`. Its `kindLook` provider (ticket 450)
 * hands the terrain shader each roster slot's species look and the rarity tints.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { rosterDebugActions } from './debug'
import { ROSTER_KIND_LOOK } from './systems/render/kindLookProvider'
import { rosterMaterialsHook } from './systems/rosterFold'

export const slice: SliceDefinition = {
  id: 'roster',
  register(r) {
    r.generationHook(rosterMaterialsHook)
    r.debugActions(rosterDebugActions)
    r.kindLook(ROSTER_KIND_LOOK)
  },
}
