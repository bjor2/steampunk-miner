/**
 * The drill-gear slice's registration (#205, data half in ticket 242): no side effects at import;
 * the loader calls `register`.
 *
 * Registers nothing yet. The eight rows stay vision rows, unbuyable and unseen by the store, the
 * tree, the item cards and the bots, until #205 ships the effect and registers `vehicle-item`,
 * `tech-node` and `power-up` content from `systems/drillGearItems.ts` (the `side_drills` row flips
 * from vision to shipped there, as a named re-pin exception).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'drill-gear',
  register() {},
}
