/**
 * The sensing slice's public API (feature-slices.md 2.1): the only file another slice may import
 * from this folder. The eight #162 sensing rows, their tree nodes, prices and `statPreview`; six
 * ship (#203) and the galvanic probe and the void sounder stay held (`HELD_SENSING_ITEM_IDS`).
 * The lane's P16 fork (ticket 269): its pair, its two charged items and the reads that draw them,
 * the Scout's vague ping and the Diviner's cone.
 */
export const SENSING_SLICE_ID = 'sensing'
export type { SensingItem, SensingNode } from './systems/sensingCatalogue'
export { SENSING_ITEMS, sensingItemOf } from './systems/sensingCatalogue'
export { HELD_SENSING_ITEM_IDS } from './systems/sensingContent'
export { itemPriceOf, markLadderOf, techNodeOf, vehicleItemOf } from './systems/sensingItems'
export type {
  SensingStatLine,
  SensingStatName,
  SensingStatPreview,
  SensingStatUnit,
} from './systems/statPreview'
export { statPreview } from './systems/statPreview'
export {
  DIVINER_ROD,
  SCOUT_PINGER,
  SENSING_FORK,
  SENSING_FORK_BALANCE,
  SENSING_FORK_ITEM_IDS,
} from './systems/sensingFork'
export { BRANCH_INACTIVE, forkItemPrice } from './systems/forkItems'
export { scoutPingOf } from './systems/scoutPing'
export { divinerReadOf, type DivinerRead, type DivinerWarning } from './systems/divinerCone'
