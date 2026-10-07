/**
 * The mining-gates slice's public API (feature-slices.md 2.1, #142 "Slice and contract"): the only
 * file another slice may import from this folder. `canMine` and the cell's gate, the read-only gate
 * table for the bot and the reports, the five extractors with their arrival, price and ownership,
 * the drill gate's tip arithmetic, whether an extractor is at work (the fold-flat pose), and the
 * lock marker a cell wears before contact with its act tint (ticket 238, for whoever draws it).
 * Types, pure selectors and constants only.
 */
export const MINING_GATES_SLICE_ID = 'mining-gates'

export { canMine, minTipLevelOf } from './systems/canMine'
export { cellGateOf, gateTableOfPlanet } from './systems/cellGates'
export { extractorWorkOf, type ExtractorWork } from './systems/extractorWork'
export type { ClearMethod, GateKindName } from './systems/gateEvents'
export { GATE_ROWS, type LostAs, type Rig, type RiglessOutcome } from './systems/gateRows'
export {
  lockMarkerOf,
  motionSignatureOf,
  type LockMarker,
  type LockMarkerKind,
} from './systems/render/lockMarkers'
export { signatureTintOf } from './systems/render/markerTints'
export {
  gatedValueShareBpOf,
  gateTableOf,
  itemOfGate,
  type CellGate,
  type CellGateKind,
  type GatedEntry,
  type GateTable,
} from './systems/gateTable'
export {
  availableFromPlanet,
  ownsRig,
  rigNamed,
  rigOfGateClass,
  rigPriceOf,
  signatureRigOf,
} from './systems/rigs'
