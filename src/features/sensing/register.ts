/**
 * The sensing slice's registration (#203, data half in ticket 241): no side effects at import;
 * the loader calls `register`.
 *
 * Registers nothing yet. The eight rows stay vision rows, unbuyable and unseen by the store, the
 * tree, the item cards and the bots, until #203 ships the effect and registers `vehicle-item`,
 * `tech-node` and `power-up` content from `systems/sensingItems.ts`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'sensing',
  register() {},
}
