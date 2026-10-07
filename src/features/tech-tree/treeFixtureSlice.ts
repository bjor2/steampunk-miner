/**
 * A stand-in for the lane slices in specs: registers the #161 authored tree and the ten combo
 * templates the way the lanes will, through `content`. Its id is `tech`, so the registrar takes
 * the spec's `tech.<lane>.<name>` ids. Only specs use it, through `withRegistrations`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { AUTHORED_TREE_FIXTURE, COMBO_TEMPLATES_FIXTURE } from './systems/treeFixtures'

export const TREE_FIXTURE_SLICE: SliceDefinition = {
  id: 'tech',
  register(r) {
    r.content('tech-node', AUTHORED_TREE_FIXTURE)
    r.content('tech-combo-template', COMBO_TEMPLATES_FIXTURE)
  },
}
