/**
 * Whether the drill or a blast may take an ore cell (docs/standards/feature-slices.md 3.6, #142's
 * `canMine`): `mining-gates` registers checks, the drill and the blast each ask for one verdict. A
 * check answers null for a cell with no gate. With no check registered both take today's path.
 *
 * A verdict is the gate's answer to the means in the query: `cut` opens the cell (a blast frees it
 * whole, #142 "Dynamite-only share"), `refused` leaves it standing, `lost` breaks it without ore.
 * `blocked` leaves it standing too: #142's scratch-only cell, a drill-gated signature the tip only
 * scratches (the drill works it, it neither breaks nor yields), reported apart from a skid. A `cut`
 * may name a share of the drill's own speed (D5 #864: `blastBit` grinds through blast-only rock at
 * a quarter): the cell takes its drill time over that share, after every floor of the law.
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
  /**
   * For a `cut` by the drill: the share of its own speed it cuts the cell at, in basis points of
   * full speed (D5 #864). Absent at full speed; read by `gatedDrillTimeOf`.
   */
  drillSpeedBp?: number
}

export interface GateCheck {
  id: string
  /** null: no gate on this cell. */
  check(query: GateQuery): GateVerdict | null
}

export const GATE_CHECK_REGISTRY = defineRegistry<GateCheck>('gateChecks')

const FULL_SPEED_BP = 10000

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

/**
 * A cell's drill time, in ticks or sub-steps, under the verdict's `drillSpeedBp`: the time over
 * the share, rounded up, so a quarter speed takes four times as long; the time itself at full speed.
 */
export function gatedDrillTimeOf(time: number, verdict: GateVerdict | null): number {
  const speedBp = verdict?.drillSpeedBp ?? FULL_SPEED_BP
  return Math.ceil((time * FULL_SPEED_BP) / speedBp)
}

function strongerVerdict(held: GateVerdict | null, next: GateVerdict | null): GateVerdict | null {
  if (held === null) return next
  if (next === null) return held
  return OUTCOME_PRECEDENCE[next.outcome] > OUTCOME_PRECEDENCE[held.outcome] ? next : held
}
