/**
 * Whether the drill or a blast may take an ore cell (docs/standards/feature-slices.md 3.6, #142's
 * `canMine`): `mining-gates` registers checks, the drill and the blast each ask for one verdict. A
 * check answers null for a cell with no gate. With no check registered both take today's path.
 *
 * A verdict is the gate's answer to the means in the query: `cut` opens the cell (a blast frees it
 * whole, #142 "Dynamite-only share"), `refused` leaves it standing, `lost` breaks it without ore.
 * `blocked` leaves it standing too: #142's scratch-only cell, a drill-gated signature the tip only
 * scratches (the drill works it, it neither breaks nor yields), reported apart from a skid.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { TilePoint } from '../world/tileGrid'
import type { BlastEvent } from './blastEffects'
import type { OreType } from './oreTypes'
import { defineRegistry, entriesOf } from './seal'

export type GateOutcome = 'cut' | 'refused' | 'blocked' | 'lost'

export interface GateQuery {
  state: AuthorityState
  playerId: string
  tile: TilePoint
  cell: number
  ore: OreType
  /** The blast asking; null when the drill asks. */
  blast: BlastEvent | null
  /**
   * The power-up asking, by its terrain edit's `source` (#142 "Constraints on other systems");
   * absent when the drill or a blast asks. A tool never clears, drains or moves a gated cell.
   */
  tool?: string
}

/** What the gate needs and what the player has, as #142's `gate_hit` logs them. */
export interface GateVerdict {
  outcome: GateOutcome
  gateKind: string
  required: string
  have: string
  /**
   * For a cell left standing that the player's own extractor opens by standing by it (ticket 237:
   * a tune, an etch, a pull): the ticks it takes once the drill has touched the cell, so the
   * pacing bot can wait instead of routing round. Absent when standing by opens nothing.
   */
  opensAfterTicks?: number
}

export interface GateCheck {
  id: string
  /** null: no gate on this cell. */
  check(query: GateQuery): GateVerdict | null
}

export const GATE_CHECK_REGISTRY = defineRegistry<GateCheck>('gateChecks')

/** Higher wins: refused over blocked over lost over cut. */
const OUTCOME_PRECEDENCE: Readonly<Record<GateOutcome, number>> = {
  cut: 0,
  lost: 1,
  blocked: 2,
  refused: 3,
}

/** Whether any slice registered a check: with none, the drill keeps today's path. */
export function hasGateChecks(): boolean {
  return entriesOf(GATE_CHECK_REGISTRY).length > 0
}

/** refused > blocked > lost > cut; ties break on the lowest check id. null when no check has an opinion. */
export function gateVerdictOf(query: GateQuery): GateVerdict | null {
  let verdict: GateVerdict | null = null
  for (const gate of entriesOf(GATE_CHECK_REGISTRY))
    verdict = strongerVerdict(verdict, gate.check(query))
  return verdict
}

/** The checks run in id order, so on a tie the one already held came from the lower id. */
/** Whether the verdict leaves the cell standing against the means asked: refused or blocked. */
export function isStandingVerdict(verdict: GateVerdict): boolean {
  return verdict.outcome === 'refused' || verdict.outcome === 'blocked'
}

function strongerVerdict(held: GateVerdict | null, next: GateVerdict | null): GateVerdict | null {
  if (held === null) return next
  if (next === null) return held
  return OUTCOME_PRECEDENCE[next.outcome] > OUTCOME_PRECEDENCE[held.outcome] ? next : held
}
