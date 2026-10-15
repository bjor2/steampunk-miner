import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import type { TilePoint } from '../world/tileGrid'
import {
  walkCarryInRuns,
  walkCarryPerCell,
  type CarryCell,
  type CarryGround,
  type CarryPurse,
  type CarryReach,
  type CarryWalk,
} from './carryWalk'
import { pointAtStep, SWEEP_STEP_MM, type SweepPath } from './sweptCut'

// The exact drill carry (ticket 399): the walk's work picks how far a tick cuts, cell by cell,
// its remainder carried exactly; hard stops discard it, and core, lava, hazards, a full hold and
// an empty tank end the tick's walk at the cell with nothing carried.

const Q = DRILL_SUBSTEPS_PER_TICK
const COLUMN_X = 500
const TOP_Y = 100_500
const WALKS: readonly [string, CarryWalk][] = [
  ['per cell', walkCarryPerCell],
  ['in runs', walkCarryInRuns],
]

const OPEN: CarryCell = { price: 0, energy: 0, isOre: false, isCarryEnd: false }
const rock = (price: number): CarryCell => ({ price, energy: 1, isOre: false, isCarryEnd: false })

/** Down column 0 from `TOP_Y`; `cellOf` prices tile row `ty`, `stops` lists hard stops. */
function columnGround(
  cellOf: (ty: number) => CarryCell,
  stops: readonly number[] = [],
): CarryGround {
  return { isStop: ({ ty }) => stops.includes(ty), cellAt: ({ ty }) => cellOf(ty) }
}

function pathDown(fromY: number, toY: number, isFresh = false): SweepPath {
  const steps = Math.max(1, Math.ceil((fromY - toY) / SWEEP_STEP_MM))
  return { from: { xMm: COLUMN_X, yMm: fromY }, to: { xMm: COLUMN_X, yMm: toY }, isFresh, steps }
}

const plenty = (subSteps: number): CarryPurse => ({ subSteps, tank: 1_000_000, room: 1_000 })

interface ColumnTick {
  reach: CarryReach
  yMm: number
}

/**
 * Ticks of a cursor walking down from `TOP_Y` toward `toY`, `strideMm` further each tick (the pose
 * runs ahead of the cut), until it has paid `cells` cells or `maxTicks` passed.
 */
function walkColumn(
  walk: CarryWalk,
  ground: CarryGround,
  { strideMm, toY, maxTicks }: { strideMm: number; toY: number; maxTicks: number },
): ColumnTick[] {
  const ticks: ColumnTick[] = []
  let yMm = TOP_Y
  let carry = 0
  for (let tick = 1; tick <= maxTicks && yMm > toY; tick++) {
    const poseY = Math.max(toY, TOP_Y - strideMm * tick)
    const path = pathDown(yMm, poseY)
    const reach = walk({ path, beyond: null }, plenty(Q + carry), ground)
    yMm = pointAtStep(path, Math.max(0, reach.reachedStep)).yMm
    carry = reach.carrySubSteps
    ticks.push({ reach, yMm })
  }
  return ticks
}

const paidRowsOf = (ticks: readonly ColumnTick[]) =>
  ticks.flatMap(({ reach }) => reach.paid.map(({ ty }) => ty))

/** A deterministic spread of prices, from 1 sub-step to several ticks. */
const priceOfRow = (ty: number) => 1 + ((ty * 7919) % 337)

describe('drill carry (ticket 399)', () => {
  describe.each(WALKS)('walked %s', (_name, walk) => {
    it('spends exactly the sum of the cells prices over a 100-cell column', () => {
      const ground = columnGround((ty) => rock(priceOfRow(ty)))
      const ticks = walkColumn(walk, ground, { strideMm: 100_000, toY: 500, maxTicks: 5_000 })
      const rows = paidRowsOf(ticks)
      expect(rows).toEqual(Array.from({ length: 100 }, (_, index) => 99 - index))
      // Exact carry: the cell whose running total of prices is S is paid on tick ceil(S / Q).
      let total = 0
      for (const ty of rows) {
        total += priceOfRow(ty)
        const paidOn = ticks.findIndex(({ reach }) => reach.paid.some((tile) => tile.ty === ty))
        expect(paidOn + 1).toBe(Math.ceil(total / Q))
      }
    })

    it('cuts several cells in one tick when they cost less than a tick, carrying the rest', () => {
      const ground = columnGround(() => rock(7))
      const reach = walk({ path: pathDown(TOP_Y, 80_500), beyond: null }, plenty(Q), ground)
      expect(reach.paid).toHaveLength(8)
      expect(reach.carrySubSteps).toBe(Q - 8 * 7)
      expect(reach.target).toEqual({ tx: 0, ty: 91 })
    })

    it('pays a part-dug cell only what is left of it', () => {
      const ground = columnGround((ty) => (ty === 99 ? rock(20) : rock(500)))
      const reach = walk({ path: pathDown(TOP_Y, 95_500), beyond: null }, plenty(Q), ground)
      expect(reach.paid).toEqual([{ tx: 0, ty: 99 }])
      expect(reach.carrySubSteps).toBe(Q - 20)
    })

    it.each([18, 60, 300])('stops dead before a hard stop with no carry at %i m/s', (speed) => {
      const strideMm = Math.round((speed * 1000) / 60)
      const ground = columnGround(() => rock(45), [90])
      const ticks = walkColumn(walk, ground, { strideMm, toY: 500, maxTicks: 400 })
      const last = ticks[ticks.length - 1]
      expect(Math.max(...paidRowsOf(ticks).map((ty) => 90 - ty))).toBe(-1)
      expect(last.yMm).toBeGreaterThanOrEqual(91_000)
      expect(last.reach.carrySubSteps).toBe(0)
      expect(last.reach.target).toBeNull()
    })

    it.each<[string, CarryCell]>([
      ['core', { price: 30, energy: 1, isOre: false, isCarryEnd: true }],
      ['a hazard', { price: 30, energy: 1, isOre: false, isCarryEnd: true }],
      ['lava', { price: 0, energy: 0, isOre: false, isCarryEnd: true }],
    ])('cuts %s and ends the tick there, its carry dropped', (_kind, cell) => {
      const ground = columnGround((ty) => (ty === 98 ? cell : rock(5)))
      const path = pathDown(TOP_Y, 90_500)
      const reach = walk({ path, beyond: null }, plenty(Q), ground)
      const paidRows = reach.paid.map(({ ty }) => ty)
      expect(paidRows).toEqual(cell.price > 0 ? [99, 98] : [99])
      expect(tileAtReach(path, reach).ty).toBe(98)
      expect(reach.carrySubSteps).toBe(0)
    })

    it('cuts the ore cell a full hold loses and ends the tick there, never refused', () => {
      const ore: CarryCell = { price: 5, energy: 1, isOre: true, isCarryEnd: false }
      const ground = columnGround(() => ore)
      const reach = walk(
        { path: pathDown(TOP_Y, 90_500), beyond: null },
        { subSteps: Q, tank: 1_000, room: 3 },
        ground,
      )
      expect(reach.paid.map(({ ty }) => ty)).toEqual([99, 98, 97, 96])
      expect(reach.carrySubSteps).toBe(0)
    })

    it('cuts the cell that empties the tank and ends the tick there', () => {
      const ground = columnGround(() => ({ ...rock(5), energy: 4 }))
      const reach = walk(
        { path: pathDown(TOP_Y, 90_500), beyond: null },
        { subSteps: Q, tank: 10, room: 0 },
        ground,
      )
      expect(reach.paid.map(({ ty }) => ty)).toEqual([99, 98, 97])
      expect(reach.carrySubSteps).toBe(0)
    })

    it('banks what is left at the pose toward the next cell, short of its price', () => {
      const ground = columnGround((ty) => (ty === 97 ? rock(40) : rock(5)))
      const beyond = { tx: 0, ty: 97 }
      const reach = walk({ path: pathDown(TOP_Y, 98_500), beyond }, plenty(Q), ground)
      expect(reach.paid).toHaveLength(2)
      expect(reach.carrySubSteps).toBe(39)
      expect(reach.target).toEqual(beyond)
    })

    it('banks nothing toward open ground past the pose', () => {
      const ground = columnGround((ty) => (ty === 97 ? OPEN : rock(5)))
      const reach = walk(
        { path: pathDown(TOP_Y, 98_500), beyond: { tx: 0, ty: 97 } },
        plenty(Q),
        ground,
      )
      expect(reach.carrySubSteps).toBe(0)
      expect(reach.target).toBeNull()
    })

    it('reaches nothing on a fresh path whose start it cannot pay, carrying its work', () => {
      const ground = columnGround(() => rock(200))
      const reach = walk({ path: pathDown(TOP_Y, 99_000, true), beyond: null }, plenty(Q), ground)
      expect(reach.reachedStep).toBe(-1)
      expect(reach.carrySubSteps).toBe(Q)
      expect(reach.target).toEqual({ tx: 0, ty: 100 })
    })
  })

  it('pays in runs exactly what it pays per cell, over mixed ground and purses', () => {
    const kinds: CarryCell[] = [
      rock(9),
      rock(9),
      rock(9),
      { price: 9, energy: 1, isOre: true, isCarryEnd: false },
      OPEN,
      rock(31),
      { price: 12, energy: 2, isOre: false, isCarryEnd: true },
      { price: 0, energy: 0, isOre: false, isCarryEnd: true },
    ]
    for (let seed = 1; seed <= 200; seed++) {
      const ground = columnGround(
        (ty) => kinds[(ty * seed * 31 + (ty >> 2)) % kinds.length],
        [40 + (seed % 50)],
      )
      const purse = { subSteps: 20 + ((seed * 37) % 400), tank: 3 + (seed % 60), room: seed % 7 }
      const sweep = { path: pathDown(TOP_Y, 40_500 + seed * 10), beyond: { tx: 0, ty: 39 } }
      expect(walkCarryInRuns(sweep, purse, ground)).toEqual(walkCarryPerCell(sweep, purse, ground))
    }
  })
})

function tileAtReach(path: SweepPath, reach: CarryReach): TilePoint {
  const { yMm } = pointAtStep(path, reach.reachedStep)
  return { tx: 0, ty: Math.floor(yMm / 1000) }
}
