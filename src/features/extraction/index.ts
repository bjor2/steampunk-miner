/**
 * The extraction slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The mineral drain and slurry siphon rows (#162), their tree nodes,
 * prices and `statPreview`, and the income trip every income item shares (#162 4.5): the
 * `extraction` section the #164 card line reads (`incomeItemValue`, `tripCap`), the cap formula
 * and the percent the card prints. The drain combos (#206) read and move the same counter. The
 * lane's P16 fork (ticket 269): Prospector ships, Hauler is held until #385. A run's delivered
 * income per planet folds from its lines for the #385 lane.
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
export type { IncomeTrip } from './systems/incomeTrip'
export { EXTRACTION_TRIP_SECTION, incomeTripOf } from './systems/incomeTrip'
export { roomUnderCapOf, tripCapAt, tripCapUsedPercentOf } from './systems/tripCap'
export { DRAIN_CAPPED } from './systems/mineralDrain'
export { extractionTechNodes } from './systems/extractionContent'
export {
  EXTRACTION_FORK,
  HAULER_HOPPER,
  HELD_EXTRACTION_FORK_NODES,
  PROSPECTOR_SIEVE,
  SHIPPED_EXTRACTION_FORK_NODES,
} from './systems/extractionFork'
export type { DeliveredIncomeFold, PlanetIncome } from './deliveredIncome'
export { startDeliveredIncomeFold } from './deliveredIncome'
