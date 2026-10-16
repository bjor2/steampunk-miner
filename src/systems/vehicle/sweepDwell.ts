/**
 * The swept cut's dwell ledger (ticket 441, the TD shape on #441 with the VS and HS rulings), pure
 * and integer: where the stamp's centre stood while a tick spent its work, and how much it spent
 * there, so the rim is charged the work spent near it (`world/rimDwell.ts`), not a whole tick.
 *
 * - **A paid cell's work is spent at the sub-step before its centre enters it**: the carry walk
 *   stops the stamp there until the work pays the cell (`carryWalk.ts`).
 * - **The carry is spent where the walk reached**, toward its next cell. A gate, a stop or open
 *   ground past the pose carries nothing and adds no station, so discarded work cuts nothing (HS).
 * - **Work the cursor carried in was spent the tick before**: it pays the first stations first.
 * - So the stations' work sums to the tick's `DRILL_SUBSTEPS_PER_TICK` when nothing is discarded,
 *   built only from the walk's own paid cells in walk order.
 * - **The carry station charges the carry the cursor keeps** (ticket 466, fix A): the swept carve
 *   builds the ledger from the carry the release clamp stores (`authority/clampedCharge.ts`).
 *   Carried-in work a later tick drops at a gate, a release or open ground stays charged to the
 *   tick that spent it at its carry station (GD 6209400700 Q1 (c), counted by tick), so over a leg
 *   the stations sum to the paid prices, the final carry and `droppedCarryInOf`, exactly.
 * - **The carry debt** (ticket 471's slice 1, ticket 503; the TD shape 6214473101 on #471): what a
 *   tick drops of its carried-in work is owed, and the next ticks' stations pay it after their
 *   carried-in work, so after every tick the stations sum to the paid prices, the kept carry and
 *   the debt still owed. Paid cells are cleared in full first and never discounted; the debt only
 *   lowers later rim dwell. It is dark: only the specs' recorder (`sweptChargeFixtures.ts`) holds it.
 */
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import type { SampleDwell } from '../world/rimDwell'
import { discWeightAt, type SampleRange, type StampPoint } from '../world/stampShape'
import type { CarryReach } from './carryWalk'
import { pointAtStep, type SweepPath } from './sweptCut'

/** `work` sub-steps spent with the stamp's centre at `at`. */
export interface DwellStation {
  at: StampPoint
  work: number
}

/** What the ledger reads of a tick's walk. */
export type WalkSpend = Pick<
  CarryReach,
  'reachedStep' | 'carrySubSteps' | 'paidPrices' | 'paidSteps'
>

/**
 * The tick's stations in walk order, less the `carriedIn` sub-steps the tick before spent, then
 * less the `debt` earlier ticks over-charged (none by default: the ledger as fix A built it).
 */
export function dwellLedgerOf(
  path: SweepPath,
  spend: WalkSpend,
  carriedIn: number,
  debt = 0,
): DwellStation[] {
  const stations = [...paidStationsOf(path, spend), ...carryStationOf(path, spend)]
  return lessWork(lessWork(stations, carriedIn), debt)
}

function paidStationsOf(path: SweepPath, { paidSteps, paidPrices }: WalkSpend): DwellStation[] {
  return paidSteps.map((step, at) => ({ at: pointAtStep(path, step - 1), work: paidPrices[at] }))
}

function carryStationOf(path: SweepPath, { reachedStep, carrySubSteps }: WalkSpend) {
  return carrySubSteps > 0 ? [{ at: pointAtStep(path, reachedStep), work: carrySubSteps }] : []
}

/**
 * The carried-in sub-steps a tick drops: what the cursor brought past the tick's paid prices and
 * the carry it keeps. The tick before charged them at its carry station (ticket 466).
 */
export function droppedCarryInOf(spend: KeptSpend, carriedIn: number): number {
  return Math.max(0, carriedIn - keptWorkOf(spend))
}

/** What the debt rules read of a tick's walk: its paid prices and the carry it keeps. */
export type KeptSpend = Pick<WalkSpend, 'paidPrices' | 'carrySubSteps'>

/** The paid prices and the kept carry: the work the tick's stations hold before any is taken. */
function keptWorkOf({ paidPrices, carrySubSteps }: KeptSpend): number {
  return paidPrices.reduce((sum, price) => sum + price, 0) + carrySubSteps
}

/**
 * The debt a tick leaves (ticket 471's rule): what its stations, net of the carried-in work, could
 * not pay of the `debt` it owed, plus the carried-in work it dropped. Never below 0.
 */
export function carryDebtAfter(spend: KeptSpend, carriedIn: number, debt: number): number {
  const netStations = Math.max(0, keptWorkOf(spend) - carriedIn)
  return Math.max(0, debt - netStations) + droppedCarryInOf(spend, carriedIn)
}

/** The debt a tick starts owing: none on a fresh path, which leaves the old debt as its carry. */
export function carryDebtOwedOn(path: Pick<SweepPath, 'isFresh'>, debt: number): number {
  return path.isFresh ? 0 : debt
}

/**
 * The debt once the cursor stores less carry than the tick charged at its carry station (an emptied
 * tank keeps none, `authority/sweptCarry.ts` `carryLeftAfter`): the carry it dropped is owed too.
 */
export function carryDebtAfterTank(debt: number, kept: number, stored: number): number {
  return debt + Math.max(0, kept - stored)
}

/** The stations with `work` taken from the first in order; those left with none dropped. */
function lessWork(stations: readonly DwellStation[], work: number): DwellStation[] {
  let left = work
  const spent: DwellStation[] = []
  for (const { at, work } of stations) {
    const taken = Math.min(work, left)
    left -= taken
    if (work > taken) spent.push({ at, work: work - taken })
  }
  return spent
}

/**
 * The dwell at each sample: every station's work times its bare disc's falloff weight there,
 * summed. Built once a tick over each station's own square of samples, so a sample costs a lookup.
 */
export function sampleDwellOf(ledger: readonly DwellStation[], radiusMm: number): SampleDwell {
  const rows = new Map<number, Map<number, number>>()
  for (const station of ledger) addStationDwell(rows, station, radiusMm)
  return (sx, sy) => rows.get(sy)?.get(sx) ?? 0
}

function addStationDwell(
  rows: Map<number, Map<number, number>>,
  { at, work }: DwellStation,
  radiusMm: number,
): void {
  const columns = samplesAcross(at.xMm, radiusMm)
  const span = samplesAcross(at.yMm, radiusMm)
  for (let sy = span.first; sy <= span.last; sy++) {
    const row = rowOf(rows, sy)
    for (let sx = columns.first; sx <= columns.last; sx++) {
      const weight = discWeightAt(at, radiusMm, sx, sy)
      if (weight > 0) row.set(sx, (row.get(sx) ?? 0) + work * weight)
    }
  }
}

function rowOf(rows: Map<number, Map<number, number>>, sy: number): Map<number, number> {
  const known = rows.get(sy)
  if (known !== undefined) return known
  const row = new Map<number, number>()
  rows.set(sy, row)
  return row
}

/** The samples within `radiusMm` of `centreMm` along one axis, both ends included. */
function samplesAcross(centreMm: number, radiusMm: number): SampleRange {
  return {
    first: Math.ceil((centreMm - radiusMm) / MM_PER_SAMPLE),
    last: Math.floor((centreMm + radiusMm) / MM_PER_SAMPLE),
  }
}
