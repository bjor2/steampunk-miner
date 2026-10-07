/**
 * The extractor verbs' domain events (ticket 237, #142 acceptance 13's "logging starts at the
 * beginning"): a tune rung or broken, a mark sprayed, a canister filled, a pull broken, a lump
 * harpooned and the counts refilled at the dock. A cell an extractor frees is the ledger's
 * `GateCleared`, and one lost without it its `GateOreLost`.
 *
 * Events raised on the authority clock (the tune, the pull) name their player: a tick carries no
 * command stamp.
 */
declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** The Resonance Fork rang `cells` connected cells of the touched ore, drillable until then. */
    'mining-gates.OreTuned': {
      playerId: string
      tx: number
      ty: number
      cells: number
      untilTick: number
    }
    /** The vehicle moved off, sped up or the cell went before the tune finished. */
    'mining-gates.TuneBroken': { playerId: string; tx: number; ty: number }
    /** The Acid Etcher marked the cells round `tx, ty`, drillable from `readyAtTick`. */
    'mining-gates.MarkSprayed': { tx: number; ty: number; readyAtTick: number; marksLeft: number }
    /** The Containment Hood bottled the freed cell's ore. */
    'mining-gates.CanisterFilled': { tx: number; ty: number; canistersLeft: number }
    /** The Induction Coil lost the cell: out of range, out of sight, or the cell went. */
    'mining-gates.PullBroken': { playerId: string; tx: number; ty: number }
    /** The Aether Tether caught the freed lump; it is sold with the hold. */
    'mining-gates.LumpHarpooned': { tx: number; ty: number; oreId: string; tier: number }
    /** The recharge refilled the canisters and marks used this dive. */
    'mining-gates.ExtractorsRefilled': { canisters: number; marks: number }
  }
}

export {}
