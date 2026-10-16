import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { discWeightAt } from '../world/stampShape'
import {
  walkCarryPerCell,
  type BeyondCell,
  type CarryCell,
  type CarryGround,
  type CarryReach,
} from './carryWalk'
import { droppedCarryInOf, dwellLedgerOf, sampleDwellOf, type DwellStation } from './sweepDwell'
import { pointAtStep, SWEEP_STEP_MM, type SweepPath } from './sweptCut'

// The swept cut's dwell ledger (ticket 441): where the stamp's centre stood while the tick spent
// its work, built from the carry walk's own paid cells in walk order.

const Q = DRILL_SUBSTEPS_PER_TICK
const TOP_Y = 100_500
const RADIUS_MM = 950

const rock = (price: number): CarryCell => ({ price, energy: 1, isOre: false, isCarryEnd: false })
const CORE: CarryCell = { price: 9, energy: 1, isOre: false, isCarryEnd: true }

/** Column 0 below the start row: rows priced by `cellOf`, `stops` hard stops. */
function columnGround(cellOf: (ty: number) => CarryCell, stops: readonly number[] = []) {
  const ground: CarryGround = {
    isStop: ({ ty }) => stops.includes(ty),
    cellAt: ({ ty }) => (ty === 100 ? rock(0) : cellOf(ty)),
  }
  return ground
}

function pathDown(toY: number, isFresh = false): SweepPath {
  const steps = Math.max(1, Math.ceil((TOP_Y - toY) / SWEEP_STEP_MM))
  return { from: { xMm: 500, yMm: TOP_Y }, to: { xMm: 500, yMm: toY }, isFresh, steps }
}

/** A tick's walk down the column with `carriedIn` banked, and its ledger. */
function tickOf(
  { path, ground, beyond }: { path: SweepPath; ground: CarryGround; beyond?: BeyondCell },
  carriedIn = 0,
): { reach: CarryReach; ledger: DwellStation[] } {
  const purse = { subSteps: Q + carriedIn, tank: 1_000_000, room: 1_000 }
  const reach = walkCarryPerCell({ path, beyond: beyond ?? null }, purse, ground)
  return { reach, ledger: dwellLedgerOf(path, reach, carriedIn) }
}

const workOf = (ledger: readonly DwellStation[]) => ledger.reduce((sum, { work }) => sum + work, 0)

const FACE_BEYOND: BeyondCell = { tile: { tx: 0, ty: 95 }, price: 1_000 }

describe('swept dwell ledger (ticket 441)', () => {
  it("sums to the tick's work on a fresh tick that pays cells and carries the rest", () => {
    const path = pathDown(95_500, true)
    const { reach, ledger } = tickOf({ path, ground: columnGround(() => rock(14)) })
    expect(reach.paid.length).toBe(4)
    expect(reach.carrySubSteps).toBe(Q - 4 * 14)
    expect(workOf(ledger)).toBe(Q)
  })

  it("sums to the tick's work on a continuing tick, its carried-in work taken from the first station", () => {
    const path = pathDown(95_500)
    const { reach, ledger } = tickOf({ path, ground: columnGround(() => rock(70)) }, 50)
    expect(reach.paidPrices).toEqual([70])
    expect(ledger[0].work).toBe(70 - 50)
    expect(workOf(ledger)).toBe(Q)
  })

  it("sums to the tick's work on a tick that only carries, at the step where the walk stopped", () => {
    const path = pathDown(95_500)
    const { reach, ledger } = tickOf({ path, ground: columnGround(() => rock(900)) }, 300)
    expect(reach.paid).toEqual([])
    expect(ledger).toEqual([{ at: pointAtStep(path, reach.reachedStep), work: Q }])
  })

  it("sums to the tick's work when the walk reaches the pose and banks toward the cell past it", () => {
    const path = pathDown(97_500)
    const ground = columnGround(() => rock(5))
    const { reach, ledger } = tickOf({ path, ground, beyond: FACE_BEYOND })
    expect(reach.reachedStep).toBe(path.steps)
    expect(reach.carrySubSteps).toBeGreaterThan(0)
    expect(workOf(ledger)).toBe(Q)
  })

  it('adds no station for the leftover a gate discards, so the gated tick spends less', () => {
    const path = pathDown(95_500)
    const { reach, ledger } = tickOf({ path, ground: columnGround(() => rock(5), [97]) })
    expect(reach.carrySubSteps).toBe(0)
    expect(ledger).toHaveLength(2)
    expect(workOf(ledger)).toBe(10)
  })

  it('adds no station past a core cell that ends the walk', () => {
    const path = pathDown(95_500)
    const ground = columnGround((ty) => (ty === 98 ? CORE : rock(5)))
    const { reach, ledger } = tickOf({ path, ground })
    expect(reach.carrySubSteps).toBe(0)
    expect(workOf(ledger)).toBe(5 + CORE.price)
  })

  it('puts each paid cell at the sub-step before its centre enters it, in walk order', () => {
    const path = pathDown(95_500)
    const { reach, ledger } = tickOf({ path, ground: columnGround(() => rock(14)) })
    const paidAt = ledger.slice(0, reach.paid.length).map(({ at }) => at)
    expect(paidAt).toEqual(reach.paidSteps.map((step) => pointAtStep(path, step - 1)))
    expect(paidAt.map(({ yMm }) => Math.floor(yMm / 1000))).toEqual([100, 99, 98, 97])
  })
})

describe('swept dwell ledger charges the carry it keeps (ticket 466)', () => {
  it('charges the carry station the clamped carry, not the walk’s', () => {
    const path = pathDown(95_500)
    const { reach } = tickOf({ path, ground: columnGround(() => rock(900)) })
    const ledger = dwellLedgerOf(path, { ...reach, carrySubSteps: Q - 12 }, 0)
    expect(ledger).toEqual([{ at: pointAtStep(path, reach.reachedStep), work: Q - 12 }])
  })

  it('drops no carried-in work the tick pays or carries on', () => {
    expect(droppedCarryInOf({ paidPrices: [70], carrySubSteps: 40 }, 50)).toBe(0)
    expect(droppedCarryInOf({ paidPrices: [], carrySubSteps: 112 }, 112)).toBe(0)
  })

  it('drops the carried-in work past what the tick pays and keeps', () => {
    expect(droppedCarryInOf({ paidPrices: [], carrySubSteps: 0 }, 48)).toBe(48)
    expect(droppedCarryInOf({ paidPrices: [0], carrySubSteps: 0 }, 30)).toBe(30)
    expect(droppedCarryInOf({ paidPrices: [5], carrySubSteps: 104 }, 116)).toBe(7)
  })

  it('sums over two ticks to the paid prices, the final carry and the carried-in work dropped', () => {
    const first = tickOf({ path: pathDown(95_500, true), ground: columnGround(() => rock(900)) })
    // The next tick meets a gate first: the carried-in work is dropped with nothing paid.
    const path = pathDown(95_500)
    const carriedIn = first.reach.carrySubSteps
    const second = tickOf({ path, ground: columnGround(() => rock(900), [99]) }, carriedIn)
    const dropped = droppedCarryInOf(second.reach, carriedIn)
    expect(dropped).toBe(carriedIn)
    expect(workOf(first.ledger) + workOf(second.ledger)).toBe(
      [...first.reach.paidPrices, ...second.reach.paidPrices].reduce((a, b) => a + b, 0) +
        second.reach.carrySubSteps +
        dropped,
    )
  })
})

describe('swept dwell at a sample (ticket 441)', () => {
  const at = { xMm: 500, yMm: 99_500 }

  it("charges a sample one station's work times its bare disc weight there", () => {
    const dwellAt = sampleDwellOf([{ at, work: Q }], RADIUS_MM)
    for (const [sx, sy] of [
      [2, 398],
      [4, 398],
      [5, 400],
      [2, 394],
    ]) {
      expect(dwellAt(sx, sy)).toBe(Q * discWeightAt(at, RADIUS_MM, sx, sy))
    }
  })

  it('sums the stations within reach and charges nothing past every radius', () => {
    const next = { xMm: 500, yMm: 99_000 }
    const dwellAt = sampleDwellOf(
      [
        { at, work: 20 },
        { at: next, work: 40 },
      ],
      RADIUS_MM,
    )
    const both =
      20 * discWeightAt(at, RADIUS_MM, 2, 397) + 40 * discWeightAt(next, RADIUS_MM, 2, 397)
    expect(dwellAt(2, 397)).toBe(both)
    expect(dwellAt(2, 380)).toBe(0)
    expect(dwellAt(40, 398)).toBe(0)
  })
})
