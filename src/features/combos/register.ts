/**
 * The combos slice's registration (ticket 206, spec #162): nothing yet. The milestone combos, the
 * four endless-only combos and the ten lane-pair templates are vision rows until each parent's
 * slice has a hook a combo can reach (`systems/comboHolds.ts`), so the store, the tree, the item
 * cards, the bots and the goldens see no trace of them. No side effects at import; the loader
 * calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'combos',
  register() {},
}
