/**
 * The six action-mix metrics of `balance:forks` (GD lock on #255, the table's last column; ticket
 * 267), one per forking lane, read off a run's `ForkMixTally`. Each metric has one or two parts, a
 * share in basis points or a rate in thousandths; a pair passes when its two branches' medians
 * differ in at least one part. A pair whose branches differ only in stats moves none of them and
 * fails (the lock's drive-differently rule).
 *
 * The sensing and aetheric metrics count branch item uses, so they name the branch whose item
 * plays each role, as the lock's table does: Scout's pings, Diviner's cone reads, Phase's phasing
 * and Arc's arcs.
 */
import {
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type Money,
} from '../../../systems/money'
import type { ForkMixRole, ForkMixTally } from './forkMixTally'
import type { TechLane } from './techNode'

export type ForkMixUnit = 'bp' | 'milli'

export interface ForkMixPart {
  label: string
  unit: ForkMixUnit
  valueOf(tally: ForkMixTally): number
}

export interface ForkMixMetric {
  lane: TechLane
  parts: readonly ForkMixPart[]
}

const BASIS_POINTS = 10000
const THOUSANDTHS = 1000

/** The lock's roles: whose item use is a ping, a cone read, a phase or an arc. */
export const FORK_MIX_ROLES: Readonly<
  Partial<Record<TechLane, Readonly<Record<string, ForkMixRole>>>>
> = {
  sensing: { scout: 'ping', diviner: 'cone' },
  aetheric: { phase: 'phase', arc: 'arc' },
}

export const FORK_MIX_METRICS: readonly ForkMixMetric[] = [
  {
    lane: 'drill-gear',
    parts: [bpPart('flank cells of cut cells', (t) => [t.flankCells, t.bitCells])],
  },
  {
    lane: 'mobility',
    parts: [bpPart('airborne ticks of action ticks', (t) => [t.airborneTicks, t.actionTicks])],
  },
  {
    lane: 'extraction',
    parts: [
      bpPart('cargo by reach of reach and bit', (t) => [t.reachUnits, t.reachUnits + t.bitUnits]),
    ],
  },
  {
    lane: 'sensing',
    parts: [
      milliPart('wide pings per trip', (t) => [t.uses.ping, t.trips]),
      milliPart('cone reads per cut cell', (t) => [t.uses.cone, t.bitCells]),
    ],
  },
  {
    lane: 'terrain',
    parts: [bpPart('blast cells of opened cells', (t) => [t.blastCells, t.openedCells])],
  },
  {
    lane: 'aetheric',
    parts: [
      bpPart('phased cells of descent cells', (t) => [t.uses.phase, t.uses.phase + t.descentCells]),
      {
        label: 'arc damage of enemy damage',
        unit: 'bp',
        valueOf: (t) => moneyShareBp(t.arcDamage, t.enemyDamage),
      },
    ],
  },
]

/** The lane's metric; a lane the lock gives none (none of the six) has none. */
export function forkMixMetricOf(lane: TechLane): ForkMixMetric | null {
  return FORK_MIX_METRICS.find((metric) => metric.lane === lane) ?? null
}

/** The metric's parts read off one run, in part order. */
export function forkMixValuesOf(metric: ForkMixMetric, tally: ForkMixTally): number[] {
  return metric.parts.map((part) => part.valueOf(tally))
}

/** Whether two branches' values differ in some part: the pair's verdict on the median seed. */
export function doBranchesDiffer(first: readonly number[], second: readonly number[]): boolean {
  return first.some((value, at) => value !== second[at])
}

/** A part's value as the report prints it: a percentage, or a rate to three places. */
export function formatForkMixValue(unit: ForkMixUnit, value: number): string {
  return unit === 'bp' ? `${(value / 100).toFixed(2)}%` : (value / THOUSANDTHS).toFixed(3)
}

type Counts = (tally: ForkMixTally) => readonly [number, number]

function bpPart(label: string, counts: Counts): ForkMixPart {
  return { label, unit: 'bp', valueOf: (tally) => ratioOf(counts(tally), BASIS_POINTS) }
}

function milliPart(label: string, counts: Counts): ForkMixPart {
  return { label, unit: 'milli', valueOf: (tally) => ratioOf(counts(tally), THOUSANDTHS) }
}

/** `part` per `whole` in `scale`ths, rounded down; 0 for nothing to divide. */
function ratioOf([part, whole]: readonly [number, number], scale: number): number {
  return whole === 0 ? 0 : Math.floor((part * scale) / whole)
}

function moneyShareBp(part: Money, whole: Money): number {
  if (cmp(whole, fromSafeInteger(0)) <= 0) return 0
  return toSafeInteger(floor(mul(div(part, whole), fromSafeInteger(BASIS_POINTS))))
}
