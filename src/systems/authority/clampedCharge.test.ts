import { describe, expect, it } from 'vitest'
import type { CarryReach } from '../vehicle/carryWalk'
import { dwellLedgerOf, type DwellStation } from '../vehicle/sweepDwell'
import { pointAtStep, type SweepPath } from '../vehicle/sweptCut'
import { chargedCarveOf } from './clampedCharge'

// Fix A on ticket 466: a tick whose release clamp lowers the carry is carved again, its ledger
// charging the clamped carry; the stored carry stays the first clamp's.

const PATH: SweepPath = {
  from: { xMm: 500, yMm: 100_500 },
  to: { xMm: 500, yMm: 95_500 },
  isFresh: false,
  steps: 20,
}

const REACH: CarryReach = {
  reachedStep: 12,
  carrySubSteps: 141,
  paid: [{ tx: 0, ty: 99 }],
  paidPrices: [40],
  paidSteps: [3],
  target: { tx: 0, ty: 97 },
}

/** A fake carve: the ledger it charges, and how many times the tick was carved. */
function ledgerCarve(carriedIn: number) {
  const charged: CarryReach[] = []
  const carve = (reach: CarryReach): DwellStation[] => {
    charged.push(reach)
    return dwellLedgerOf(PATH, reach, carriedIn)
  }
  return { carve, charged }
}

const clampTo = (carrySubSteps: number) => () => ({ ...REACH, carrySubSteps })

const workOf = (ledger: readonly DwellStation[]) => ledger.reduce((sum, { work }) => sum + work, 0)

describe('charging the clamped carry (ticket 466)', () => {
  it('carves once when the clamp keeps the walk’s carry', () => {
    const { carve, charged } = ledgerCarve(0)
    const { carved, clamped } = chargedCarveOf(carve, clampTo(141), REACH)
    expect(charged).toEqual([REACH])
    expect(clamped.carrySubSteps).toBe(141)
    expect(workOf(carved)).toBe(40 + 141)
  })

  it('carves again charging exactly the carry a released cell leaves', () => {
    const { carve, charged } = ledgerCarve(0)
    const { carved, clamped } = chargedCarveOf(carve, clampTo(113), REACH)
    expect(charged.map(({ carrySubSteps }) => carrySubSteps)).toEqual([141, 113])
    expect(clamped.carrySubSteps).toBe(113)
    expect(carved.at(-1)).toEqual({ at: pointAtStep(PATH, REACH.reachedStep), work: 113 })
    expect(workOf(carved)).toBe(40 + 113)
  })

  it('charges no carry station after a gate clamps the carry to 0', () => {
    const { carve } = ledgerCarve(0)
    const { carved, clamped } = chargedCarveOf(carve, clampTo(0), REACH)
    expect(clamped.carrySubSteps).toBe(0)
    expect(carved).toEqual([{ at: pointAtStep(PATH, REACH.paidSteps[0] - 1), work: 40 }])
  })

  it('stores the first clamp’s carry and never asks the clamp of the second carve', () => {
    const clamps: number[] = []
    const clampOf = (carved: DwellStation[]) => {
      clamps.push(workOf(carved))
      return { ...REACH, carrySubSteps: 100 }
    }
    const { clamped } = chargedCarveOf(ledgerCarve(0).carve, clampOf, REACH)
    expect(clamps).toEqual([40 + 141])
    expect(clamped).toEqual({ ...REACH, carrySubSteps: 100 })
  })

  it('changes only the carry it charges: the paid cells, prices and reach stay the walk’s', () => {
    const { carve, charged } = ledgerCarve(0)
    chargedCarveOf(carve, clampTo(60), REACH)
    expect(charged[1]).toEqual({ ...REACH, carrySubSteps: 60 })
  })

  it('takes carried-in work from the first stations of the re-carved ledger too', () => {
    const { carve } = ledgerCarve(70)
    const { carved } = chargedCarveOf(carve, clampTo(50), REACH)
    expect(workOf(carved)).toBe(40 + 50 - 70)
    expect(carved).toEqual([{ at: pointAtStep(PATH, REACH.reachedStep), work: 20 }])
  })
})
