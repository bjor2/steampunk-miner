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

/** The tick's stations in walk order, less the `carriedIn` sub-steps the tick before spent. */
export function dwellLedgerOf(
  path: SweepPath,
  spend: WalkSpend,
  carriedIn: number,
): DwellStation[] {
  const stations = [...paidStationsOf(path, spend), ...carryStationOf(path, spend)]
  return lessCarriedIn(stations, carriedIn)
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
export function droppedCarryInOf(
  { paidPrices, carrySubSteps }: Pick<WalkSpend, 'paidPrices' | 'carrySubSteps'>,
  carriedIn: number,
): number {
  const kept = paidPrices.reduce((sum, price) => sum + price, 0) + carrySubSteps
  return Math.max(0, carriedIn - kept)
}

/** The stations with `carriedIn` taken from the first in order; those left with none dropped. */
function lessCarriedIn(stations: readonly DwellStation[], carriedIn: number): DwellStation[] {
  let left = carriedIn
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
