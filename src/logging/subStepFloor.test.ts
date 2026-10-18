import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../constants/balance'
import type { KnownRedMarker } from '../constants/knownRed'
import { TICKS_PER_SECOND } from '../constants/physics'
import { blockHardness } from '../systems/economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../systems/economy/vehicleStats'
import { subStepsPerTile } from '../systems/vehicle/drillRule'
import { knownRedVerdict } from './knownRed'

// The drill law's one-sub-step floor under the per-purchase drill (the GD ruling on #551 and its
// amendment, VS and the TD 6254671302; ticket 552). A cell is paid in ceil(3600 H^3 / (D P^2))
// sub-steps and never fewer than one, so on soft ground (planet 1 band 1, H = 1, the tip at step 0,
// P = 1) the step each purchase delivers stays in 1.181..1.305 through purchase 23, leaves it at 24
// (1.176), is dead (x1.00) from 33 and stops at one sub-step a cell, 3600 cells/s, from 37: no rig
// cuts band 1 at 5000 cells/s. Both rows are carried known red under #558, which lifts the floor
// and is their expiry; no economy cap hides them (Bjor's no-cap ruling). On frontier ground a cell
// costs 115 to 240 sub-steps, so the rounding stays under about 0.9% there.

/** Local to this spec, as the lanes' markers are: the repo's one exported marker is ticket 419's. */
const SUB_STEP_FLOOR_KNOWN_RED: KnownRedMarker = {
  finding: 558,
  reason:
    'KNOWN_RED: delivered step per level breaks on soft ground from L24, dead levels from L33 (and no rig cuts past 3600 cells/s): the one-sub-step floor #558 lifts',
}
const GATE = 'the sub-step floor rows'
const PURCHASE_BAND = { lowest: 1.181, highest: 1.305 }
const LAST_BANDED_PURCHASE = 23
const LAST_PURCHASE = 40
/** The kernel row past the floor (#551 section 7, acceptance 6). */
const PAST_THE_FLOOR_CELLS_PER_SECOND = 5000
/** A drill far past every rig: whatever the purchase, a cell still costs one sub-step. */
const FAR_PAST_THE_FLOOR = 3000
const SOFT_GROUND = blockHardness(1, 1)
const CELLS_PER_SECOND_AT_ONE_SUB_STEP = DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND

function readFindingTicketFile(finding: number): string | null {
  const url = new URL(`../../docs/metrics/tickets/${finding}.json`, import.meta.url)
  return existsSync(url) ? readFileSync(url, 'utf8') : null
}

/** Sub-steps a soft-ground cell costs at `purchase`, the tip at step 0. */
function subStepsAt(purchase: number): number {
  const stats = vehicleStatsAt({ ...startLevels(), drill_power: purchase })
  return subStepsPerTile(stats, SOFT_GROUND) as number
}

/** The step purchase `purchase` delivers over the one before it, in cut speed. */
function deliveredStepOf(purchase: number): number {
  return subStepsAt(purchase - 1) / subStepsAt(purchase)
}

function purchasesBetween(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}

function isInBand(step: number): boolean {
  return step >= PURCHASE_BAND.lowest && step <= PURCHASE_BAND.highest
}

/** The purchases from 2 to `LAST_PURCHASE` whose delivered step leaves the band, as problems. */
function softGroundProblems(): string[] {
  return purchasesBetween(2, LAST_PURCHASE)
    .filter((purchase) => !isInBand(deliveredStepOf(purchase)))
    .map(
      (purchase) =>
        `purchase ${purchase} delivers x${deliveredStepOf(purchase).toFixed(3)} on soft ground (${subStepsAt(purchase)} sub-steps a cell)`,
    )
}

/** The fastest band-1 cut the law allows, against the row's 5000 cells/s. */
function pastTheFloorProblems(): string[] {
  const fastest = CELLS_PER_SECOND_AT_ONE_SUB_STEP / subStepsAt(FAR_PAST_THE_FLOOR)
  if (fastest >= PAST_THE_FLOOR_CELLS_PER_SECOND) return []
  return [
    `no drill cuts soft ground at ${PAST_THE_FLOOR_CELLS_PER_SECOND} cells/s: one sub-step a cell is ${fastest} cells/s`,
  ]
}

describe('the drill law at its one-sub-step floor (#551, ticket 552)', () => {
  it('delivers 1.181 to 1.305 a purchase on soft ground through purchase 23', () => {
    const outside = purchasesBetween(2, LAST_BANDED_PURCHASE).filter(
      (purchase) => !isInBand(deliveredStepOf(purchase)),
    )
    expect(outside).toEqual([])
  })

  it('first leaves the band at purchase 24 and first delivers a dead purchase at 33, as VS measured', () => {
    const left = purchasesBetween(2, LAST_PURCHASE).find(
      (purchase) => !isInBand(deliveredStepOf(purchase)),
    )
    const dead = purchasesBetween(2, LAST_PURCHASE).find(
      (purchase) => deliveredStepOf(purchase) === 1,
    )
    expect([left, dead]).toEqual([24, 33])
  })

  it('carries the soft-ground steps from purchase 24 as known red under #558', () => {
    const problems = { covered: softGroundProblems(), uncovered: [] }
    const verdict = knownRedVerdict(SUB_STEP_FLOOR_KNOWN_RED, problems, readFindingTicketFile, GATE)
    console.log(verdict.knownRed.join('\n'))
    expect(verdict.failures).toEqual([])
  })

  it('fails the 5000 cells/s row loudly at the floor, carried as known red under #558', () => {
    const problems = { covered: pastTheFloorProblems(), uncovered: [] }
    const verdict = knownRedVerdict(SUB_STEP_FLOOR_KNOWN_RED, problems, readFindingTicketFile, GATE)
    console.log(verdict.knownRed.join('\n'))
    expect(problems.covered).toHaveLength(1)
    expect(verdict.failures).toEqual([])
  })
})
