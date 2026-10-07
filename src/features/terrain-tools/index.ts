/**
 * The terrain-tools slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The eight terrain manipulation rows (#162), their tree nodes, prices
 * and `statPreview`. #202 ships four with their effect (`SHIPPED_TERRAIN_ITEMS`); the other four
 * stay vision rows (`HELD_BACK_ITEM_IDS`). The terrain magnets (#246) are data only until the
 * magnetic-planet spec: their rows, family tag and card entries.
 */
export const TERRAIN_TOOLS_SLICE_ID = 'terrain-tools'
export type { TerrainItem, TerrainNode, TerrainSizeUnit } from './systems/terrainItems'
export {
  TERRAIN_ITEMS,
  itemPriceOf,
  markLadderOf,
  techNodeOf,
  terrainItemOf,
  vehicleItemOf,
} from './systems/terrainItems'
export type {
  TerrainStatLine,
  TerrainStatName,
  TerrainStatPreview,
  TerrainStatUnit,
} from './systems/statPreview'
export { statPreview } from './systems/statPreview'
export type {
  MagnetCardLine,
  MagnetInput,
  MagnetItem,
  MagnetReading,
  MagnetVerb,
} from './systems/magnetItems'
export {
  MAGNET_ITEMS,
  TERRAIN_MAGNETS_FAMILY,
  magnetItemOf,
  magnetMarkLadderOf,
  magnetVehicleItemOf,
} from './systems/magnetItems'
export { MAGNET_ITEM_CARDS } from './systems/magnetCards'
export { HELD_BACK_ITEM_IDS, isHeldBack, SHIPPED_TERRAIN_ITEMS } from './systems/shippedTools'
