/**
 * Whether the drill may take an ore cell (docs/standards/feature-slices.md 3.6, #142's `canMine`):
 * `mining-gates` registers checks, the drill asks for one verdict. A check with no opinion answers
 * null. With no check registered the drill takes today's path.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { TilePoint } from '../world/tileGrid'
import type { OreType } from './oreTypes'
import { defineRegistry, entriesOf } from './seal'

export type GateOutcome = 'cut' | 'refused' | 'lost'

export interface GateQuery {
  state: AuthorityState
  playerId: string
  tile: TilePoint
  cell: number
  ore: OreType
}

export interface GateVerdict {
  outcome: GateOutcome
  gateKind: string
  required: string
}

export interface GateCheck {
  id: string
  /** null: no opinion on this cell. */
  check(query: GateQuery): GateVerdict | null
}

export const GATE_CHECK_REGISTRY = defineRegistry<GateCheck>('gateChecks')

/** Higher wins: refused over lost over cut. */
const OUTCOME_PRECEDENCE: Readonly<Record<GateOutcome, number>> = { cut: 0, lost: 1, refused: 2 }

/** refused > lost > cut; ties break on the lowest check id. null when no check has an opinion. */
export function gateVerdictOf(query: GateQuery): GateVerdict | null {
  let verdict: GateVerdict | null = null
  for (const gate of entriesOf(GATE_CHECK_REGISTRY))
    verdict = strongerVerdict(verdict, gate.check(query))
  return verdict
}

/** The checks run in id order, so on a tie the one already held came from the lower id. */
function strongerVerdict(held: GateVerdict | null, next: GateVerdict | null): GateVerdict | null {
  if (held === null) return next
  if (next === null) return held
  return OUTCOME_PRECEDENCE[next.outcome] > OUTCOME_PRECEDENCE[held.outcome] ? next : held
}
