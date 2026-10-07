/**
 * The extraction slice's registration (#201, data half in ticket 239): no side effects at import;
 * the loader calls `register`.
 *
 * Registers nothing yet. The drain and siphon rows stay vision rows, unbuyable and unseen by the
 * store, the tree, the item cards and the bots, until #201 ships the effect and registers
 * `vehicle-item`, `tech-node` and `power-up` content from `systems/extractionItems.ts`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'extraction',
  register() {},
}
