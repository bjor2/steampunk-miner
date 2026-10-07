/**
 * The descriptions slice (#164): the side table of card entries for today's kernel buyables, and
 * the one `itemDescriber` provider. No side effects at import; the loader calls `register`.
 *
 * The describer (`ITEM_CARD_DESCRIBER` in `systems/describeItemCard.ts`) is not registered yet:
 * once it answers, the compact shop row replaces the kernel row and with it the #33 screen ids
 * (`src/ui/screenIds.test.ts`), which waits on a planner's call on #164. Registering it is one
 * `r.itemDescriber(ITEM_CARD_DESCRIBER)` here.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { kernelEntries } from './systems/kernelEntries'

export const slice: SliceDefinition = {
  id: 'descriptions',
  register(r) {
    r.itemDescriptionEntries(kernelEntries())
  },
}
