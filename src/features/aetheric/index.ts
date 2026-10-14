/**
 * The aetheric slice's public API (docs/standards/feature-slices.md 2.1): the Aetheric science
 * lane of the tech tree (GD lock on #245) and its first item, the resonance whistle (#262). The
 * only file another slice may import from this folder.
 */
export const AETHERIC_SLICE_ID = 'aetheric'
export { AETHERIC_TECH_NODES } from './systems/aethericNodes'
export { WHISTLE_ID, whistleMarkLadder } from './systems/whistleItem'
export { statPreview } from './systems/statPreview'
export { AETHERIC_SECTION, whistleOf, type SoundingWhistle } from './systems/whistleSection'
