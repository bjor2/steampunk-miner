/**
 * The combos slice's public API (feature-slices.md 2.1): the only file another slice may import
 * from this folder. The milestone combos researched at the `research_lab` (#162, #161), the
 * endless-only combos and the fifteen lane-pair templates, their rows and prices; the shipped ones
 * play through the kernel item hooks or their aetheric parent's own rules, the rest are held as
 * vision rows (`COMBO_HOLDS`). This slice imports no lane slice: parents are node and item ids.
 */
export const COMBOS_SLICE_ID = 'combos'
export type { ComboItem, ComboNode } from './systems/comboCatalogue'
export { COMBO_ITEMS, comboItemOf } from './systems/comboCatalogue'
export {
  COMBO_TEMPLATES,
  authoredComboNodesOf,
  comboPriceAt,
  comboTemplateOf,
  techNodeOf,
  vehicleItemOf,
} from './systems/comboRows'
export { COMBO_HOLDS } from './systems/comboHolds'
