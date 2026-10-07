/**
 * The terrain-tools slice's registration (#202, data half in ticket 240): no side effects at
 * import; the loader calls `register`.
 *
 * Registers nothing yet. The eight terrain rows stay vision rows, unbuyable and unseen by the
 * store, the tree, the item cards and the bots, until #202 ships the effect and registers
 * `vehicle-item`, `tech-node` and `power-up` content from `systems/terrainItems.ts`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'terrain-tools',
  register() {},
}
