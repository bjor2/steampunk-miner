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

/** The cursor's own row: open in the world once the step before paid it. */
const START_ROW = 100

/**
 * Down column 0 from `TOP_Y`; `cellOf` prices tile row `ty` below the start row, `stops` lists
 * hard stops, and the start row is `startCell`.
 */
function columnGround(
  cellOf: (ty: number) => CarryCell,
  stops: readonly number[] = [],
  startCell: CarryCell = OPEN,
): CarryGround {
  return {
    isStop: ({ ty }) => stops.includes(ty),
    cellAt: ({ ty }) => (ty === START_ROW ? startCell : cellOf(ty)),
  }
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
  const opened = new Set<number>()
  // The world clears a paid cell, so the next tick crosses it for nothing.
  const world: CarryGround = {
    isStop: ground.isStop,
    cellAt: (tile) => (opened.has(tile.ty) ? OPEN : ground.cellAt(tile)),
    releasedPriceAt: ground.releasedPriceAt,
  }
  let yMm = TOP_Y
  let carry = 0
  for (let tick = 1; tick <= maxTicks && yMm > toY; tick++) {
    const poseY = Math.max(toY, TOP_Y - strideMm * tick)
    const path = pathDown(yMm, poseY)
    const reach = walk({ path, beyond: null }, plenty(Q + carry), world)
    reach.paid.forEach(({ ty }) => opened.add(ty))
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
      const ground = columnGround(() => rock(5))
      const beyond = { tile: { tx: 0, ty: 97 }, price: 40 }
      const reach = walk({ path: pathDown(TOP_Y, 98_500), beyond }, plenty(Q), ground)
      expect(reach.paid).toHaveLength(2)
      expect(reach.carrySubSteps).toBe(39)
      expect(reach.target).toEqual(beyond.tile)
    })

    it('banks nothing toward open ground past the pose', () => {
      const ground = columnGround(() => rock(5))
      const reach = walk(
        { path: pathDown(TOP_Y, 98_500), beyond: { tile: { tx: 0, ty: 97 }, price: 0 } },
        plenty(Q),
        ground,
      )
      expect(reach.carrySubSteps).toBe(0)
      expect(reach.target).toBeNull()
    })

    it('walks on from a continuing start in a cell that ended the step before', () => {
      const lava: CarryCell = { price: 0, energy: 0, isOre: false, isCarryEnd: true }
      const ground = columnGround(() => rock(5), [], lava)
      const reach = walk({ path: pathDown(TOP_Y, 98_500), beyond: null }, plenty(Q), ground)
      expect(reach.paid.map(({ ty }) => ty)).toEqual([99, 98])
    })

    it('reaches nothing on a fresh path that starts in a hard stop, carrying nothing', () => {
      const ground = columnGround(() => rock(5), [100])
      const reach = walk({ path: pathDown(TOP_Y, 95_000, true), beyond: null }, plenty(Q), ground)
      expect(reach).toEqual({
        reachedStep: -1,
        carrySubSteps: 0,
        paid: [],
        paidPrices: [],
        target: null,
      })
    })

    it('never prices the start of a path: the body cell or the cursor cell', () => {
      const ground = columnGround(() => rock(200), [], rock(200))
      for (const isFresh of [true, false]) {
        const reach = walk(
          { path: pathDown(TOP_Y, 98_500, isFresh), beyond: null },
          plenty(Q),
          ground,
        )
        expect(reach.paid).toEqual([])
        expect(reach.carrySubSteps).toBe(Q)
        expect(reach.target).toEqual({ tx: 0, ty: 99 })
      }
    })
  })

  it('asks the ground about the same cells in runs as per cell, none past where it stops', () => {
    const askedBy = (walk: CarryWalk) => {
      const asked: number[] = []
      const ground: CarryGround = {
        isStop: ({ ty }) => (asked.push(ty), ty === 80),
        cellAt: ({ ty }) => (ty === START_ROW ? OPEN : rock(9)),
      }
      walk({ path: pathDown(TOP_Y, 70_500), beyond: null }, plenty(Q), ground)
      return asked
    }
    expect(askedBy(walkCarryInRuns)).toEqual(askedBy(walkCarryPerCell))
    expect(Math.min(...askedBy(walkCarryInRuns))).toBe(93)
  })

  it('pays in runs exactly what it pays per cell, over mixed ground, purses and releases', () => {
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
      const ground = {
        ...columnGround(
          (ty) => kinds[(ty * seed * 31 + (ty >> 2)) % kinds.length],
          [40 + (seed % 50)],
        ),
        releasedPriceAt: ({ ty }: TilePoint) => (ty % 3 === seed % 3 ? (ty * seed) % 25 : null),
      }
      const purse = { subSteps: 20 + ((seed * 37) % 400), tank: 3 + (seed % 60), room: seed % 7 }
      const beyond = { tile: { tx: 0, ty: 39 }, price: seed % 90 }
      const sweep = { path: pathDown(TOP_Y, 40_500 + seed * 10), beyond }
      expect(walkCarryInRuns(sweep, purse, ground)).toEqual(walkCarryPerCell(sweep, purse, ground))
    }
  })
})

function tileAtReach(path: SweepPath, reach: CarryReach): TilePoint {
  const { yMm } = pointAtStep(path, reach.reachedStep)
  return { tx: 0, ty: Math.floor(yMm / 1000) }
}

// A released cell (ticket 421, rule (b)): once the stamp may carve the cell the work cannot pay in
// full, the walk prices it again after the stamp's bite, pays that on the tick it meets it when the
// work left covers it, discards the surplus and goes on with nothing left to spend.

/** Down the column with every cell at `price`, row `releasedRow` released at `releasedPrice`. */
function releasingGround(price: number, releasedRow: number, releasedPrice: number): CarryGround {
  return {
    ...columnGround(() => rock(price)),
    releasedPriceAt: ({ ty }) => (ty === releasedRow ? releasedPrice : null),
  }
}

describe('a released cell in the carry walk (ticket 421)', () => {
  describe.each(WALKS)('walked %s', (_name, walk) => {
    const sweep = { path: pathDown(TOP_Y, 95_500), beyond: null }

    it('pays a released cell what the stamp left of it on the tick it meets it, the rest discarded', () => {
      const reach = walk(sweep, plenty(100), releasingGround(200, 99, 40))
      expect(reach.paid).toEqual([{ tx: 0, ty: 99 }])
      expect(reach.paidPrices).toEqual([40])
      expect(reach.carrySubSteps).toBe(0)
      expect(reach.target).toEqual({ tx: 0, ty: 98 })
    })

    it('pays a released cell the stamp cleared for nothing, so it yields where the walk crossed it', () => {
      const reach = walk(sweep, plenty(100), releasingGround(200, 99, 0))
      expect(reach.paid).toEqual([{ tx: 0, ty: 99 }])
      expect(reach.paidPrices).toEqual([0])
    })

    it('carries the work toward a released cell the stamp left dearer than the work', () => {
      const reach = walk(sweep, plenty(100), releasingGround(200, 99, 101))
      expect(reach.paid).toEqual([])
      expect(reach.carrySubSteps).toBe(100)
      expect(reach.target).toEqual({ tx: 0, ty: 99 })
    })

    it('ends the walk at a released core cell it pays, with nothing carried', () => {
      const core = { price: 200, energy: 1, isOre: false, isCarryEnd: true }
      const ground = { ...releasingGround(200, 99, 40), cellAt: () => core }
      const reach = walk(sweep, plenty(100), ground)
      expect(reach.paid).toEqual([{ tx: 0, ty: 99 }])
      expect(reach.carrySubSteps).toBe(0)
      expect(reach.target).toBeNull()
    })

    it('releases one cell a tick: the next the stamp emptied is carried toward, never chained free', () => {
      const ground: CarryGround = {
        ...columnGround(() => rock(200)),
        releasedPriceAt: () => 0,
      }
      const reach = walk(sweep, plenty(100), ground)
      expect(reach.paid).toEqual([{ tx: 0, ty: 99 }])
      expect(reach.paidPrices).toEqual([0])
      expect(reach.carrySubSteps).toBe(0)
      expect(reach.target).toEqual({ tx: 0, ty: 98 })
    })

    it('never asks the release of a cell the work pays in full, nor walks past a hard stop', () => {
      const asked: number[] = []
      const ground: CarryGround = {
        ...columnGround(() => rock(20), [97]),
        releasedPriceAt: ({ ty }) => (asked.push(ty), 0),
      }
      const reach = walk(sweep, plenty(100), ground)
      expect(asked).toEqual([])
      expect(reach.paid).toEqual([
        { tx: 0, ty: 99 },
        { tx: 0, ty: 98 },
      ])
      expect(reach.carrySubSteps).toBe(0)
    })

    it('pays each cell exactly what was left of it, and no tick more than its carry and work', () => {
      const releasedPriceOf = (ty: number) => (ty % 3 === 0 ? Math.floor(priceOfRow(ty) / 4) : null)
      const ground = {
        ...columnGround((ty) => rock(priceOfRow(ty))),
        releasedPriceAt: ({ ty }: TilePoint) => releasedPriceOf(ty),
      }
      const ticks = walkColumn(walk, ground, { strideMm: 100_000, toY: 500, maxTicks: 5_000 })
      expect(paidRowsOf(ticks)).toEqual(Array.from({ length: 100 }, (_, index) => 99 - index))
      let carried = 0
      let releasedPays = 0
      for (const { reach } of ticks) {
        const prices = reach.paid.map(({ ty }, at) => ({ ty, price: reach.paidPrices[at] }))
        const onRelease = prices.filter(({ ty, price }) => price !== priceOfRow(ty))
        expect(onRelease.map(({ ty }) => releasedPriceOf(ty))).toEqual(
          onRelease.map(({ price }) => price),
        )
        const paid = prices.reduce((sum, { price }) => sum + price, 0)
        // Work is spent exactly while the walk carries toward a cell and pays none on release; a
        // release discards the rest, as the column's end does.
        if (onRelease.length > 0)
          expect([paid <= Q + carried, reach.carrySubSteps]).toEqual([true, 0])
        else if (reach.target !== null) expect(paid + reach.carrySubSteps).toBe(Q + carried)
        releasedPays += onRelease.length
        carried = reach.carrySubSteps
      }
      expect(releasedPays).toBeGreaterThan(10)
    })
  })
})
