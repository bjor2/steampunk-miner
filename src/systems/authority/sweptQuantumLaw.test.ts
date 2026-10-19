import { beforeAll, describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import {
  ceil,
  cmp,
  div,
  fromSafeInteger,
  mul,
  toFixedText,
  toSafeInteger,
  type BigStat,
} from '../money'
import {
  bandOneCellCostAt,
  COLUMN_LEG,
  cutLeg,
  drillStepOfRig,
  quantumAtDrillStep,
  reachAlongOf,
  rigAt,
  subStepsAtDrillStep,
  subStepsSpentBy,
  TILTED_LEG,
  type Leg,
  type LegCut,
  type SpeedRig,
} from './sweptRigFixtures'

// The drill law's felt speed per purchase on the swept carve (#397's law on #439's rigs), judged in
// the quantum bands of ticket 463 (GD ruling of Oct 16, option (a): keep the quantum, no price
// change). Since the GD ruling on #551 (ticket 552) a drill level is one purchase of x1.243 and
// the band is 1.181 to 1.305 a purchase (1.243 +-5%, GD point 4) in place of 1.12 +-5% a major.
// A cell is paid in whole sub-steps, so a row's real cost `c` is rounded up by as much as 1/c of
// it, and a ratio of two rows can carry both errors: rounding alone keeps a +-5% band only from
// c = 20. Between 10 and 20 the band holds only as measured, so a row there is a real assert once
// its measured row passes; under 10 it is a todo. At every c, no purchase may be dead and five
// purchases average inside the band, judged where the rig's own purchase costs a sub-step or more.
// Since ticket 558 (#551 B1) `c` is counted in the rig's own drill quantum, which doubles until a
// band-1 cell costs 100 sub-steps or more, so every rig here, 3600 m/s included, is judged hard.

const WINDOW_MM = 30_000
/** One purchase's gain, 1.243 +-5% (GD ruling on #551, point 4). */
const PURCHASE_BAND = { lowest: 1.181, highest: 1.305 }
/** Five purchases below the rig's own: the window the averaged ratio is taken over (VS on #463). */
const WINDOW_PURCHASES = 5

/** From here rounding alone keeps a per-major ratio inside +-5%: the worst case 1/c is 5%. */
const HARD_COST = fromSafeInteger(20)
/** From here to `HARD_COST` the band holds only as measured: a row is promoted when it passes. */
const PROMOTABLE_COST = fromSafeInteger(10)
/** Under a sub-step a cell a faster purchase cannot cut faster until the remainder carry lands. */
const QUANTUM_COST = fromSafeInteger(1)

const LAW_RIGS = [44, 240, 3600].map(rigAt)
const LEGS: readonly { name: string; leg: Leg }[] = [
  { name: 'down the column', leg: COLUMN_LEG },
  { name: 'down the tilted radius', leg: TILTED_LEG },
]

/** Rows between 10 and 20 sub-steps a cell whose measured ratio passes, promoted to a real assert. */
const PROMOTED_ROWS: readonly string[] = []

/** A rig's six purchases down a leg, its own first: what each cuts a sub-step, and its own c. */
interface PurchaseWindow {
  name: string
  rig: SpeedRig
  /** The rig's own band-1 cell cost in sub-steps of its drill quantum, before the law rounds it up. */
  cost: BigStat
  /** Metres the cut reached per sub-step spent, `paces[k]` at k purchases below the rig's drill. */
  paces: number[]
}

/** How ticket 463 judges a per-purchase ratio row: a real assert, a logged row, or a todo. */
type LawBand = 'hard' | 'logged' | 'todo'

/**
 * A window holds at least this many of the rig's strides: since ticket 558 the 3600 m/s rig cuts in
 * its own quantum, and 30 m is half of one of its ticks, too short to read a pace in.
 */
const WINDOW_MIN_STRIDES = 3

function windowMmOf(rig: SpeedRig): number {
  return Math.max(WINDOW_MM, (WINDOW_MIN_STRIDES * rig.speed * 1000) / 60)
}

/** A rig's pace down a leg: metres its cut reached per sub-step of work it spent. */
function paceOf(cut: LegCut): number {
  const run = cutLeg({ ...cut, reachMm: windowMmOf(cut.rig) })
  return reachAlongOf(cut.leg, run.ticks[run.ticks.length - 1].state) / subStepsSpentBy(run)
}

function purchaseWindowOf(
  rig: SpeedRig,
  { name, leg }: { name: string; leg: Leg },
): PurchaseWindow {
  const drillStep = drillStepOfRig(rig)
  const paces = Array.from({ length: WINDOW_PURCHASES + 1 }, (_, below) =>
    paceOf({ rig, leg, maxTicks: 400, drillStep: drillStep - below }),
  )
  return { name: `${rig.speed} m/s ${name}`, rig, cost: quantumCellCostAt(drillStep), paces }
}

/** A band-1 cell's real cost at a drill step in sub-steps of its own quantum (ticket 558). */
function quantumCellCostAt(drillStep: number): BigStat {
  const scale = div(fromSafeInteger(quantumAtDrillStep(drillStep)), BASE_QUANTUM)
  return mul(bandOneCellCostAt(drillStep), scale)
}

const BASE_QUANTUM = fromSafeInteger(DRILL_SUBSTEPS_PER_TICK)

/** Each purchase's pace over the one below it, the rig's own first. */
function purchaseRatiosOf({ paces }: PurchaseWindow): number[] {
  return paces.slice(0, -1).map((pace, below) => pace / paces[below + 1])
}

/** The geometric mean of the window's five per-purchase ratios. */
function averagedRatioOf({ paces }: PurchaseWindow): number {
  return Math.pow(paces[0] / paces[WINDOW_PURCHASES], 1 / WINDOW_PURCHASES)
}

/** The window's own purchase ratio, or its averaged one for a window of a few strides only. */
function judgedRatioOf(window: PurchaseWindow): number {
  if (isFewStrides(window.rig)) return averagedRatioOf(window)
  const [ratio] = purchaseRatiosOf(window)
  return ratio
}

/** A rig whose window holds only its minimum strides, past the 30 m every other rig cuts. */
function isFewStrides(rig: SpeedRig): boolean {
  return windowMmOf(rig) > WINDOW_MM
}

const isInBand = (ratio: number) => ratio >= PURCHASE_BAND.lowest && ratio <= PURCHASE_BAND.highest

function lawBandOf({ name, cost }: PurchaseWindow): LawBand {
  if (cmp(cost, HARD_COST) >= 0) return 'hard'
  if (cmp(cost, PROMOTABLE_COST) < 0) return 'todo'
  return PROMOTED_ROWS.includes(name) ? 'hard' : 'logged'
}

/** The VS conditions judge a window only where the rig's own purchase costs a sub-step or more. */
const isJudgedAtAnyCost = ({ cost }: PurchaseWindow) => cmp(cost, QUANTUM_COST) >= 0

/** Logs a window with its c, so no row the bands leave unasserted is skipped silently. */
function logLawWindow(window: PurchaseWindow): string {
  const ratios = purchaseRatiosOf(window).map((ratio) => ratio.toFixed(3))
  const line =
    `ticket 463 law row ${window.name}: c ${toFixedText(window.cost, 3)} sub-steps a cell, ` +
    `band ${lawBandOf(window)}, per purchase ${ratios.join(' ')}, ` +
    `averaged ${averagedRatioOf(window).toFixed(3)}`
  console.info(line)
  return line
}

describe('quantum bands of the drill law on the swept carve (tickets 439 and 463)', () => {
  let windows: PurchaseWindow[] = []
  beforeAll(() => {
    windows = LEGS.flatMap((leg) => LAW_RIGS.map((rig) => purchaseWindowOf(rig, leg)))
  }, 240_000)

  it("reads each rig's cost a cell from the drill law, which rounds it up to the rig's sub-steps", () => {
    const misread = LAW_RIGS.flatMap((rig) => {
      const drillStep = drillStepOfRig(rig)
      const rounded = toSafeInteger(ceil(bandOneCellCostAt(drillStep)))
      return rounded === subStepsAtDrillStep(drillStep) ? [] : [{ rig, rounded }]
    })
    expect(misread).toEqual([])
  })

  it('counts every rig in a quantum whose band-1 cell costs 100 sub-steps or more (ticket 558)', () => {
    const coarse = windows.filter(({ cost }) => cmp(cost, fromSafeInteger(99)) <= 0)
    expect(coarse.map(({ name }) => name)).toEqual([])
  })

  // A window of three strides (the 3600 m/s rig's) is judged on its averaged ratio: since ticket
  // 570 a cutting tick pays its cells at the law's pace while a travelling one (the gate shut, its
  // look-ahead 60 m away meeting a cave) carves as before, its stamp's parallel carve opening cells
  // the walk then passes for less, and one such tick in a three-stride window skews one purchase.
  it('cuts each rig the bands assert 1.181 to 1.305 times faster than the drill a purchase below it', () => {
    const hard = windows.filter((window) => lawBandOf(window) === 'hard')
    const misses = hard.flatMap((window) => {
      const ratio = judgedRatioOf(window)
      return isInBand(ratio) ? [] : [{ name: window.name, ratio }]
    })
    hard.forEach(logLawWindow)
    expect(hard.map(({ name }) => name)).toEqual(windows.map(({ name }) => name))
    expect(misses).toEqual([])
  })

  it('leaves no row the bands do not assert, 3600 m/s included, since ticket 558', () => {
    const unasserted = windows.filter((window) => lawBandOf(window) !== 'hard')
    expect(unasserted.map(logLawWindow)).toEqual([])
  })

  it('cuts every purchase of each judged rig strictly faster than the purchase below it', () => {
    const dead = windows
      .filter(isJudgedAtAnyCost)
      .flatMap((window) =>
        purchaseRatiosOf(window).flatMap((ratio, below) =>
          ratio > 1 ? [] : [{ name: window.name, below, ratio }],
        ),
      )
    expect(dead).toEqual([])
  })

  // Before ticket 558 the 3600 m/s rig's five purchases below averaged 1.172 and 1.177, held by
  // the one-sub-step floor; in its own quantum every rig is judged.
  it('averages 1.181 to 1.305 a purchase over the five purchases below every rig', () => {
    const judged = windows.filter(isJudgedAtAnyCost)
    const misses = judged.flatMap((window) => {
      const averaged = averagedRatioOf(window)
      return isInBand(averaged) ? [] : [{ name: window.name, averaged }]
    })
    expect(judged.length).toBe(LEGS.length * LAW_RIGS.length)
    expect(misses).toEqual([])
  })
})
