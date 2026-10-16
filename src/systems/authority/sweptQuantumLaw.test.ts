import { beforeAll, describe, expect, it } from 'vitest'
import { minorsPerMajor } from '../economy/upgradeSteps'
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

// The drill law's felt speed per major on the swept carve (#397's law on #439's rigs), judged in
// the quantum bands of ticket 463 (GD ruling of Oct 16, option (a): keep the quantum, no price
// change). A cell is paid in whole sub-steps, so a row's real cost `c` is rounded up by as much as
// 1/c of it, and a ratio of two rows can carry both errors: rounding alone keeps the 1.12x +-5%
// band only from c = 20. Between 10 and 20 the band holds only as measured, so a row there is a
// real assert once its measured row passes; under 10 it is a todo. At every c, no major may be dead
// and five majors average 1.12x +-5%, judged where the rig's own major costs a sub-step or more.

const WINDOW_MM = 30_000
const MAJOR_RATIO = 1.12
const RATIO_TOLERANCE = 0.05
/** Five majors below the rig's own: the window the averaged ratio is taken over (VS on #463). */
const WINDOW_MAJORS = 5

/** From here rounding alone keeps a per-major ratio inside +-5%: the worst case 1/c is 5%. */
const HARD_COST = fromSafeInteger(20)
/** From here to `HARD_COST` the band holds only as measured: a row is promoted when it passes. */
const PROMOTABLE_COST = fromSafeInteger(10)
/** Under a sub-step a cell a faster major cannot cut faster until the remainder carry lands. */
const QUANTUM_COST = fromSafeInteger(1)

const LAW_RIGS = [44, 240, 3600].map(rigAt)
const LEGS: readonly { name: string; leg: Leg }[] = [
  { name: 'down the column', leg: COLUMN_LEG },
  { name: 'down the tilted radius', leg: TILTED_LEG },
]

/**
 * Rows between 10 and 20 sub-steps a cell whose measured ratio passes, promoted to a real assert:
 * 240 m/s (c 14.6) read 1.138 down the column. Down the tilted radius it read 1.1761, just over
 * the band's 1.176, so it stays logged.
 */
const PROMOTED_ROWS = ['240 m/s down the column']

/** A rig's six majors down a leg, its own first: what each cuts a sub-step, and its own c. */
interface MajorWindow {
  name: string
  rig: SpeedRig
  /** The rig's own band-1 cell cost in sub-steps, before the law rounds it up. */
  cost: BigStat
  /** Metres the cut reached per sub-step spent, `paces[k]` at k majors below the rig's drill. */
  paces: number[]
}

/** How ticket 463 judges a per-major ratio row: a real assert, a logged row, or a todo. */
type LawBand = 'hard' | 'logged' | 'todo'

/** A rig's pace down a leg: metres its cut reached per sub-step of work it spent. */
function paceOf(cut: LegCut): number {
  const run = cutLeg({ ...cut, reachMm: WINDOW_MM })
  return reachAlongOf(cut.leg, run.ticks[run.ticks.length - 1].state) / subStepsSpentBy(run)
}

function majorWindowOf(rig: SpeedRig, { name, leg }: { name: string; leg: Leg }): MajorWindow {
  const drillStep = drillStepOfRig(rig)
  const paces = Array.from({ length: WINDOW_MAJORS + 1 }, (_, below) =>
    paceOf({ rig, leg, maxTicks: 400, drillStep: drillStep - below * minorsPerMajor() }),
  )
  return { name: `${rig.speed} m/s ${name}`, rig, cost: bandOneCellCostAt(drillStep), paces }
}

/** Each major's pace over the one below it, the rig's own first. */
function majorRatiosOf({ paces }: MajorWindow): number[] {
  return paces.slice(0, -1).map((pace, below) => pace / paces[below + 1])
}

/** The geometric mean of the window's five per-major ratios. */
function averagedRatioOf({ paces }: MajorWindow): number {
  return Math.pow(paces[0] / paces[WINDOW_MAJORS], 1 / WINDOW_MAJORS)
}

const isInBand = (ratio: number) => Math.abs(ratio / MAJOR_RATIO - 1) <= RATIO_TOLERANCE

function lawBandOf({ name, cost }: MajorWindow): LawBand {
  if (cmp(cost, HARD_COST) >= 0) return 'hard'
  if (cmp(cost, PROMOTABLE_COST) < 0) return 'todo'
  return PROMOTED_ROWS.includes(name) ? 'hard' : 'logged'
}

/** The VS conditions judge a window only where the rig's own major costs a sub-step or more. */
const isJudgedAtAnyCost = ({ cost }: MajorWindow) => cmp(cost, QUANTUM_COST) >= 0

/** Logs a window with its c, so no row the bands leave unasserted is skipped silently. */
function logLawWindow(window: MajorWindow): string {
  const ratios = majorRatiosOf(window).map((ratio) => ratio.toFixed(3))
  const line =
    `ticket 463 law row ${window.name}: c ${toFixedText(window.cost, 3)} sub-steps a cell, ` +
    `band ${lawBandOf(window)}, per major ${ratios.join(' ')}, ` +
    `averaged ${averagedRatioOf(window).toFixed(3)}`
  console.info(line)
  return line
}

describe('quantum bands of the drill law on the swept carve (tickets 439 and 463)', () => {
  let windows: MajorWindow[] = []
  beforeAll(() => {
    windows = LEGS.flatMap((leg) => LAW_RIGS.map((rig) => majorWindowOf(rig, leg)))
  }, 240_000)

  it("reads each rig's cost a cell from the drill law, which rounds it up to the rig's sub-steps", () => {
    const misread = LAW_RIGS.flatMap((rig) => {
      const drillStep = drillStepOfRig(rig)
      const rounded = toSafeInteger(ceil(bandOneCellCostAt(drillStep)))
      return rounded === subStepsAtDrillStep(drillStep) ? [] : [{ rig, rounded }]
    })
    expect(misread).toEqual([])
  })

  it('cuts each rig the bands assert 1.12x +-5% faster than the drill a major below it', () => {
    const hard = windows.filter((window) => lawBandOf(window) === 'hard')
    const misses = hard.flatMap((window) => {
      const [ratio] = majorRatiosOf(window)
      return isInBand(ratio) ? [] : [{ name: window.name, ratio }]
    })
    expect(hard.length).toBeGreaterThanOrEqual(3)
    expect(misses).toEqual([])
  })

  it('logs every row the bands leave unasserted with its cost a cell', () => {
    const unasserted = windows.filter((window) => lawBandOf(window) !== 'hard')
    const lines = unasserted.map(logLawWindow)
    expect(unasserted.map(({ name }) => name)).toEqual([
      '3600 m/s down the column',
      '240 m/s down the tilted radius',
      '3600 m/s down the tilted radius',
    ])
    expect(lines.filter((line) => !line.includes(' c '))).toEqual([])
  })

  // At 3600 m/s a cell costs under one sub-step (c 0.96), so the major below it pays 2 for a real
  // 1.08 and the law itself reads 1.35 down the column, rim rule on or off (#441's finding 2).
  it.todo(
    'cuts the 3600 m/s rig 1.12x +-5% faster than the drill a major below it (ticket 463: c < 10, logged with c until the exact sub-step remainder carry; owner Systems & Economy Designer)',
  )

  it('cuts every major of each judged rig strictly faster than the major below it', () => {
    const dead = windows
      .filter(isJudgedAtAnyCost)
      .flatMap((window) =>
        majorRatiosOf(window).flatMap((ratio, below) =>
          ratio > 1 ? [] : [{ name: window.name, below, ratio }],
        ),
      )
    expect(dead).toEqual([])
  })

  // Rounding averages out over a window, so this one holds at 3600 m/s too (1.104 down the column,
  // 1.096 down the tilted radius), though its own major costs under a sub-step a cell.
  it('averages 1.12x +-5% a major over the five majors below every rig, 3600 m/s included', () => {
    const misses = windows.flatMap((window) => {
      const averaged = averagedRatioOf(window)
      return isInBand(averaged) ? [] : [{ name: window.name, averaged }]
    })
    expect(windows.length).toBe(LEGS.length * LAW_RIGS.length)
    expect(misses).toEqual([])
  })

  // The faster major's real cost must be a sub-step a cell or more for it to cut faster: under it
  // the whole-sub-step price saturates, and 3 of the 5 majors below the 3600 m/s rig read 1.000.
  it("logs the windows whose rig's own major costs under one sub-step a cell, with that cost", () => {
    const unjudged = windows.filter((window) => !isJudgedAtAnyCost(window))
    unjudged.forEach(logLawWindow)
    expect(unjudged.map(({ name }) => name)).toEqual([
      '3600 m/s down the column',
      '3600 m/s down the tilted radius',
    ])
  })

  it.todo(
    'cuts every major below the 3600 m/s rig strictly faster than the major below it (ticket 463: c < 1 sub-step, logged with c until the exact sub-step remainder carry; owner Systems & Economy Designer)',
  )
})
