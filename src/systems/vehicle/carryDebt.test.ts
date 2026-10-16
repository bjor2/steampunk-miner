import { describe, expect, it } from 'vitest'
import type { CarryReach } from './carryWalk'
import {
  carryDebtAfter,
  carryDebtAfterTank,
  carryDebtOwedOn,
  droppedCarryInOf,
  dwellLedgerOf,
  type DwellStation,
} from './sweepDwell'
import { pointAtStep, type SweepPath } from './sweptCut'

// The swept ledger's carry debt (ticket 471's slice 1, ticket 503; the TD shape 6214473101 on
// #471): carried-in work a tick drops is owed, and later ticks' stations pay it after their own
// carried-in work, so work charged equals the paid prices, the kept carry and the debt owed.

const PATH: SweepPath = {
  from: { xMm: 500, yMm: 100_500 },
  to: { xMm: 500, yMm: 95_500 },
  isFresh: false,
  steps: 20,
}

/** A walk that paid two cells at steps 3 and 7 and banks `carrySubSteps` at step 12. */
function reachOf(paidPrices: readonly number[], carrySubSteps: number): CarryReach {
  return {
    reachedStep: 12,
    carrySubSteps,
    paid: paidPrices.map((_, at) => ({ tx: 0, ty: 99 - at })),
    paidPrices: [...paidPrices],
    paidSteps: [3, 7].slice(0, paidPrices.length),
    target: { tx: 0, ty: 97 },
  }
}

const workOf = (ledger: readonly DwellStation[]) => ledger.reduce((sum, { work }) => sum + work, 0)

const paidAt = (step: number) => pointAtStep(PATH, step - 1)
const carryAt = pointAtStep(PATH, 12)

describe("the swept ledger's carry debt (ticket 471)", () => {
  it('a tick that drops carried-in work owes it to the ticks after it', () => {
    // A released cell the stamp cut to 0 left: nothing paid, nothing kept, 48 carried in.
    const dropping = reachOf([], 0)
    const owed = carryDebtAfter(dropping, 48, 0)
    expect(owed).toBe(droppedCarryInOf(dropping, 48))
    expect(owed).toBe(48)
    const next = reachOf([40, 30], 50)
    expect(workOf(dwellLedgerOf(PATH, next, 0, owed))).toBe(40 + 30 + 50 - 48)
    expect(carryDebtAfter(next, 0, owed)).toBe(0)
  })

  it('the debt is taken off the first stations after the carried-in work and never below 0', () => {
    const reach = reachOf([40, 30], 50)
    expect(dwellLedgerOf(PATH, reach, 20, 30)).toEqual([
      { at: paidAt(7), work: 30 - 10 },
      { at: carryAt, work: 50 },
    ])
    expect(dwellLedgerOf(PATH, reach, 20, 1_000)).toEqual([])
  })

  it('a tick that charges less than it owes keeps the rest as debt', () => {
    const reach = reachOf([40], 10)
    expect(dwellLedgerOf(PATH, reach, 0, 80)).toEqual([])
    expect(carryDebtAfter(reach, 0, 80)).toBe(80 - 50)
    expect(carryDebtAfter(reach, 15, 80)).toBe(80 - 35)
  })

  it('a tick with no debt charges as before, byte for byte', () => {
    for (const [prices, carry, carriedIn] of [
      [[40, 30], 50, 0],
      [[40, 30], 50, 55],
      [[], 0, 48],
      [[0], 0, 30],
      [[5], 104, 116],
    ] as const) {
      const reach = reachOf(prices, carry)
      expect(JSON.stringify(dwellLedgerOf(PATH, reach, carriedIn, 0))).toBe(
        JSON.stringify(dwellLedgerOf(PATH, reach, carriedIn)),
      )
      expect(carryDebtAfter(reach, carriedIn, 0)).toBe(droppedCarryInOf(reach, carriedIn))
    }
  })

  // Read as the tick's conservation: the charge it makes, with what it owed and what it dropped,
  // is its charge without debt with the debt it leaves (charged + owed + dropped = fix A's charge
  // + owes), so over a leg the charge is the paid prices, the kept carry and the debt still owed.
  it("a tick's charge plus the debt it leaves equals its charge without debt plus what it owed and dropped", () => {
    for (const prices of [[], [0], [40], [40, 30]]) {
      for (const carry of [0, 17, 50]) {
        for (const carriedIn of [0, 20, 90, 200]) {
          for (const owed of [0, 13, 60, 500]) {
            const reach = reachOf(prices, carry)
            const charged = workOf(dwellLedgerOf(PATH, reach, carriedIn, owed))
            const chargedWithoutDebt = workOf(dwellLedgerOf(PATH, reach, carriedIn))
            const owes = carryDebtAfter(reach, carriedIn, owed)
            const dropped = droppedCarryInOf(reach, carriedIn)
            expect(charged + owed + dropped).toBe(chargedWithoutDebt + owes)
            expect(owes).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('a gate that clamps the carry to 0 adds no carry station and no debt', () => {
    // The clamp stored no carry toward the gated cell, so the tick carries in only what it pays.
    const gated = reachOf([40], 0)
    const ledger = dwellLedgerOf(PATH, gated, 25, 10)
    expect(ledger).toEqual([{ at: paidAt(3), work: 40 - 25 - 10 }])
    expect(carryDebtAfter(gated, 25, 0)).toBe(0)
    expect(carryDebtAfter(gated, 25, 10)).toBe(0)
    expect(carryDebtAfter(reachOf([], 0), 0, 0)).toBe(0)
  })

  it('a fresh path starts with no debt', () => {
    expect(carryDebtOwedOn({ isFresh: true }, 70)).toBe(0)
    expect(carryDebtOwedOn({ isFresh: false }, 70)).toBe(70)
    const fresh = { ...PATH, isFresh: true }
    const reach = reachOf([40], 50)
    expect(dwellLedgerOf(fresh, reach, 0, carryDebtOwedOn(fresh, 70))).toEqual(
      dwellLedgerOf(fresh, reach, 0),
    )
  })

  // The settle's seam: `carryLeftAfter` stores no carry once the tank cannot pay another tick,
  // after the carry station charged the carry the clamp kept.
  it('an emptied tank that drops the kept carry owes it', () => {
    const reach = reachOf([40], 113)
    const owes = carryDebtAfter(reach, 0, 12)
    expect(owes).toBe(0)
    expect(carryDebtAfterTank(owes, 113, 0)).toBe(113)
    expect(carryDebtAfterTank(30, 113, 113)).toBe(30)
    const charged = workOf(dwellLedgerOf(PATH, reach, 0, 12))
    expect(charged).toBe(40 + 0 + carryDebtAfterTank(owes, 113, 0) - 12)
  })
})
