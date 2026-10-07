/**
 * The descriptions slice (#164): the side table of card entries for today's kernel buyables, and
 * the one `itemDescriber` provider. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { ITEM_CARD_DESCRIBER } from './systems/describeItemCard'
import { kernelEntries } from './systems/kernelEntries'

export const slice: SliceDefinition = {
  id: 'descriptions',
  register(r) {
    r.itemDescriptionEntries(kernelEntries())
    r.itemDescriber(ITEM_CARD_DESCRIBER)
  },
}
