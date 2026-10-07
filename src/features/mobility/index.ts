/**
 * The mobility slice's public API (feature-slices.md 2.1, spec #162 "Slice and contract"): the
 * item ids, `statPreview(entryId, mark, planetIndex)` and the price the future store reads. The
 * only file another slice may import from this folder.
 */
export const MOBILITY_SLICE_ID = 'mobility'
export { MOBILITY_ITEM, type MobilityItemId } from './systems/itemIds'
export { mobilityItemPriceOf, statPreview, type StatPreviewLine } from './systems/statPreview'
