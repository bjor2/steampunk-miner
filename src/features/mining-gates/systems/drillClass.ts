/**
 * The slice's answer to the kernel's ore drill classes (feature-slices.md 3.29): a dense cell
 * takes `drill.denseScratchFloor`, a drill-gated signature `H(t + 5)` with floor 1, and every other
 * cell, an extractor-gated signature included, its own tier with the global floor (#142).
 */
import type {
  OreDrillClass,
  OreDrillClassProvider,
  OreDrillClassQuery,
} from '../../../systems/registries/oreDrillClasses'
import { cellGateOf } from './cellGates'

export const MINING_GATES_DRILL_CLASS_ID = 'mining-gates.drill-class'

export const miningGatesDrillClass: OreDrillClassProvider = {
  id: MINING_GATES_DRILL_CLASS_ID,
  drillClassOf: drillClassOfCell,
}

function drillClassOfCell({ params, tile, ore }: OreDrillClassQuery): OreDrillClass {
  const gate = cellGateOf(params, tile, ore)
  if (gate.kind === 'dense') return 'dense'
  if (gate.kind === 'drillSignature') return 'signature'
  return 'ordinary'
}
