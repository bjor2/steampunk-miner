/**
 * The aetheric slice's public API (docs/standards/feature-slices.md 2.1): the Aetheric science
 * lane of the tech tree (GD lock on #245) and its items, the resonance whistle (#262), the
 * chronometric governor and the aether condenser (#263). The only file another slice may import
 * from this folder.
 */
export const AETHERIC_SLICE_ID = 'aetheric'
export { AETHERIC_TECH_NODES } from './systems/aethericNodes'
export { WHISTLE_ID, whistleMarkLadder } from './systems/whistleItem'
export { GOVERNOR_ID, governorMarkLadder } from './systems/governorItem'
export { CONDENSER_ID, condenserMarkLadder } from './systems/condenserItem'
export { statPreview } from './systems/statPreview'
export { AETHERIC_SECTION, whistleOf, type SoundingWhistle } from './systems/whistleSection'
