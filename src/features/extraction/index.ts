/**
 * The extraction slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The mineral drain and slurry siphon rows (#162), their tree nodes,
 * prices and `statPreview`; all vision rows until #201 registers them with the effect.
 */
export const EXTRACTION_SLICE_ID = 'extraction'
export type { ExtractionItem, ExtractionNode } from './systems/extractionItems'
export {
  EXTRACTION_ITEMS,
  extractionItemOf,
  itemPriceOf,
  markLadderOf,
  techNodeOf,
  vehicleItemOf,
} from './systems/extractionItems'
export type {
  ExtractionStatLine,
  ExtractionStatName,
  ExtractionStatPreview,
  ExtractionStatUnit,
} from './systems/statPreview'
export { statPreview } from './systems/statPreview'
