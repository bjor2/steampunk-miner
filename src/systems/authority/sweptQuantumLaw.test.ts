import { beforeAll, describe, expect, it } from 'vitest'
import { ceil, cmp, fromSafeInteger, toFixedText, toSafeInteger, type BigStat } from '../money'
import {
  bandOneCellCostAt,
  COLUMN_LEG,
  cutLeg,
  drillStepOfRig,
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
  /** The rig's own band-1 cell cost in sub-steps, before the law rounds it up. */
  cost: BigStat
  /** Metres the cut reached per sub-step spent, `paces[k]` at k purchases below the rig's drill. */
  paces: number[]
}

/** How ticket 463 judges a per-purchase ratio row: a real assert, a logged row, or a todo. */
type LawBand = 'hard' | 'logged' | 'todo'

/** A rig's pace down a leg: metres its cut reached per sub-step of work it spent. */
function paceOf(cut: LegCut): number {
  const run = cutLeg({ ...cut, reachMm: WINDOW_MM })
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
  return { name: `${rig.speed} m/s ${name}`, rig, cost: bandOneCellCostAt(drillStep), paces }
}

/** Each purchase's pace over the one below it, the rig's own first. */
function purchaseRatiosOf({ paces }: PurchaseWindow): number[] {
  return paces.slice(0, -1).map((pace, below) => pace / paces[below + 1])
}

/** The geometric mean of the window's five per-purchase ratios. */
function averagedRatioOf({ paces }: PurchaseWindow): number {
  return Math.pow(paces[0] / paces[WINDOW_PURCHASES], 1 / WINDOW_PURCHASES)
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

  it('cuts each rig the bands assert 1.181 to 1.305 times faster than the drill a purchase below it', () => {
    const hard = windows.filter((window) => lawBandOf(window) === 'hard')
    const misses = hard.flatMap((window) => {
      const [ratio] = purchaseRatiosOf(window)
      return isInBand(ratio) ? [] : [{ name: window.name, ratio }]
    })
    expect(hard.map(({ name }) => name)).toEqual([
      '44 m/s down the column',
      '44 m/s down the tilted radius',
    ])
    expect(misses).toEqual([])
  })

  it('logs every row the bands leave unasserted with its cost a cell', () => {
    const unasserted = windows.filter((window) => lawBandOf(window) !== 'hard')
    const lines = unasserted.map(logLawWindow)
    expect(unasserted.map(({ name }) => name)).toEqual([
      '240 m/s down the column',
      '3600 m/s down the column',
      '240 m/s down the tilted radius',
      '3600 m/s down the tilted radius',
    ])
    expect(lines.filter((line) => !line.includes(' c '))).toEqual([])
  })

  // At 3600 m/s a cell costs under one sub-step, so the purchases below it pay whole sub-steps for
  // a real fraction of one: the one-sub-step floor that #558 lifts.
  it.todo(
    'cuts the 3600 m/s rig 1.181 to 1.305 times faster than the drill a purchase below it (ticket 463: c < 10, logged with c until the sub-step floor lifts in #558)',
  )

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

  // Rounding averages out over a window, so this holds at 240 m/s (1.246 down the column, 1.238
  // down the tilted radius) though its own purchases read 1.17 to 1.32. #463 judges it where the
  // rig's own purchase costs a sub-step or more: at 3600 m/s the five purchases below average
  // 1.172 and 1.177, held by the one-sub-step floor (logged below; #558 lifts it).
  it('averages 1.181 to 1.305 a purchase over the five purchases below every judged rig', () => {
    const judged = windows.filter(isJudgedAtAnyCost)
    const misses = judged.flatMap((window) => {
      const averaged = averagedRatioOf(window)
      return isInBand(averaged) ? [] : [{ name: window.name, averaged }]
    })
    expect(judged.length).toBe(LEGS.length * (LAW_RIGS.length - 1))
    expect(misses).toEqual([])
  })

  // The faster purchase's real cost must be a sub-step a cell or more for it to cut faster: under
  // it the whole-sub-step price saturates.
  it("logs the windows whose rig's own purchase costs under one sub-step a cell, with that cost", () => {
    const unjudged = windows.filter((window) => !isJudgedAtAnyCost(window))
    unjudged.forEach(logLawWindow)
    expect(unjudged.map(({ name }) => name)).toEqual([
      '3600 m/s down the column',
      '3600 m/s down the tilted radius',
    ])
  })

  it.todo(
    'cuts every purchase below the 3600 m/s rig strictly faster than the purchase below it (ticket 463: c < 1 sub-step, logged with c until the sub-step floor lifts in #558)',
  )
})
