/**
 * The aetheric slice's public API (docs/standards/feature-slices.md 2.1): the Aetheric science
 * lane of the tech tree (GD lock on #245) and its items, the resonance whistle (#262), the P16
 * fork pair's phase lantern and galvanic arc coil (#261, the GD lock on #255), the chronometric
 * governor and the aether condenser (#263). The only file another slice may import from this
 * folder.
 */
export const AETHERIC_SLICE_ID = 'aetheric'
export { AETHERIC_TECH_NODES } from './systems/aethericNodes'
export {
  AETHERIC_FORK,
  AETHERIC_FORK_NODES,
  ARC_BRANCH,
  PHASE_BRANCH,
} from './systems/aethericFork'
export { WHISTLE_ID, whistleMarkLadder } from './systems/whistleItem'
export { LANTERN_ID, lanternMarkLadder } from './systems/lanternItem'
export { ARC_COIL_ID, arcCoilMarkLadder } from './systems/arcCoilItem'
export { GOVERNOR_ID, governorMarkLadder } from './systems/governorItem'
export { CONDENSER_ID, condenserMarkLadder } from './systems/condenserItem'
export { statPreview } from './systems/statPreview'
export { AETHERIC_SECTION, whistleOf, type SoundingWhistle } from './systems/whistleSection'
export { PHASE_SECTION, phaseOf, type PhaseMove } from './systems/phaseSection'
