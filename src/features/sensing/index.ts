/**
 * The sensing slice's public API (feature-slices.md 2.1): the only file another slice may import
 * from this folder. The eight #162 sensing rows, their tree nodes, prices and `statPreview`; all
 * vision rows until #203 registers them with the effect.
 */
export const SENSING_SLICE_ID = 'sensing'
export type { SensingItem, SensingNode } from './systems/sensingCatalogue'
export { SENSING_ITEMS, sensingItemOf } from './systems/sensingCatalogue'
export { itemPriceOf, markLadderOf, techNodeOf, vehicleItemOf } from './systems/sensingItems'
export type {
  SensingStatLine,
  SensingStatName,
  SensingStatPreview,
  SensingStatUnit,
} from './systems/statPreview'
export { statPreview } from './systems/statPreview'
