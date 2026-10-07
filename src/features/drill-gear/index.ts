/**
 * The drill-gear slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The eight drill-gear rows (#162), their `tech.drill_gear.*` nodes,
 * prices and `statPreview`; #205 registers six of them and ticket 280 the twin-bit head, the
 * dielectric bit held back.
 */
export const DRILL_GEAR_SLICE_ID = 'drill-gear'
export type { DrillPathCaps } from './systems/drillGearEconomy'
export type {
  DrillGearItem,
  DrillGearNode,
  DrillGearStat,
  DrillGearStatUnit,
} from './systems/drillGearItems'
export {
  DRILL_GEAR_ITEMS,
  drillGearItemOf,
  itemPriceOf,
  markLadderOf,
  techNodeOf,
  vehicleItemOf,
} from './systems/drillGearItems'
export type { DrillGearStatLine, DrillGearStatPreview } from './systems/statPreview'
export { statPreview } from './systems/statPreview'
