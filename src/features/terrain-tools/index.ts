/**
 * The terrain-tools slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The eight terrain manipulation rows (#162), their tree nodes, prices
 * and `statPreview`; all vision rows until #202 registers them with the effect.
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
