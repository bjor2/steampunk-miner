/**
 * The roster slice's registration: no side effects at import; the loader calls `register`.
 *
 * The roster fold draws each ore patch's material kind (`generationHook` `roster.materials`, which
 * writes the cell's kind slot: GENERATOR_VERSION 10, ticket 446). It sorts after `ores.lead` and
 * `planet-mix.mix`, so it reads the final family and tier and changes neither.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { rosterMaterialsHook } from './systems/rosterFold'

export const slice: SliceDefinition = {
  id: 'roster',
  register(r) {
    r.generationHook(rosterMaterialsHook)
  },
}
