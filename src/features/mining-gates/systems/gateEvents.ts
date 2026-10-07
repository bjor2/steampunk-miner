/**
 * The gate ledger's domain events (#142 acceptance 13, ticket 236): a gated cell freed, and one
 * broken without its ore for want of its extractor. `gate_hit` stays the kernel's `DrillGated`.
 */
import type { LostAs } from './gateRows'

/** Which kind of gate a cell carried, as `gate_hit` names it. */
export type GateKindName = 'drill' | 'rig' | 'dynamite'

/** What freed it: the drill's tip, the drill with its extractor, or a charge. */
export type ClearMethod = 'drill' | 'rig' | 'dynamite'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'mining-gates.GateCleared': {
      tx: number
      ty: number
      oreId: string
      tier: number
      gateKind: GateKindName
      method: ClearMethod
      units: number
      /** The unit's sale price, canonical (#143: the dynamite payback reads it). */
      value: string
    }
    'mining-gates.GateOreLost': {
      tx: number
      ty: number
      oreId: string
      tier: number
      units: number
      cause: LostAs
    }
  }
}
