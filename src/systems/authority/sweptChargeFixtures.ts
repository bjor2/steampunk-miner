/**
 * A recorder on the swept carve for the conservation specs (ticket 466, GD 6209400700 Q2 (i)).
 * The dwell ledger stays out of the loop until #441's ring re-run, so a leg's ticks are cut through
 * the carve's own walk seam (`SweepWalks`, the live `drillStep`'s walks), which records each tick's
 * walk; its ledger is then charged as fix A charges it (`clampedCharge.ts`), from the carry the
 * release clamp kept. Only specs use it.
 *
 * Counted by tick (GD 6209400700 Q1 (c)): over a leg, the ledgers charge the paid prices, the
 * final carry and the carried-in work later ticks drop, to the sub-step, at every tick.
 */
import { DRILL_STAMP_RADIUS_MM, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import type { CarryReach, CarryWalk } from '../vehicle/carryWalk'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { droppedCarryInOf, dwellLedgerOf } from '../vehicle/sweepDwell'
import type { SweepPath } from '../vehicle/sweptCut'
import { noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { chargedCarveOf } from './clampedCharge'
import { WITHIN_SHARE } from './drillStepCut'
import { PARAMS } from './scriptedSession'
import { drillSweepBy, type SweepWalks, type SweptCarve } from './sweptDrill'
import {
  COLUMN_LEG,
  cutLeg,
  pointAlong,
  rigAt,
  TILTED_LEG,
  type Leg,
  type LegCut,
  type LegRun,
  type LegTick,
  type SpeedRig,
} from './sweptRigFixtures'

/** One swept tick's work, in sub-steps, as its ledger charged and its walk spent it. */
export interface TickCharge {
  /** The ledger's stations' work, charging the carry the clamp kept. */
  charged: number
  /** The walk's paid cell prices. */
  paid: number
  /** The carry the walk banked, before the release clamp. */
  walked: number
  /** The carry the release clamp kept for the next tick. */
  kept: number
  /** The carry the cursor brought in. */
  carriedIn: number
  /** Carried-in work this tick dropped: the tick before charged it. */
  dropped: number
}

/** A tick's walk as the carve's walk seam saw it. */
interface WalkedTick {
  path: SweepPath
  reach: CarryReach
  carriedIn: number
}

/** The leg's swept tick, cut by the live `drillStep`'s walks, its walk's charge kept in `charges`. */
export function recordingChargesTick(charges: TickCharge[]): LegTick {
  return (state, tick, pose) => {
    const walked: WalkedTick[] = []
    const outcome = drillSweepBy(
      { ...state, tick },
      PARAMS,
      'p1',
      sweptTickAt(pose),
      recordingWalks(walked),
    )
    charges.push(...walked.map((walk) => tickChargeOf(walk, outcome.carved)))
    return outcome.effect
  }
}

function sweptTickAt(pose: VehiclePose) {
  return { target: noseTileOf(pose), step: { pose, drive: NO_DRIVE, isLifting: false } }
}

/** The live walks, each tick's carry walk recorded into `walked`. */
function recordingWalks(walked: WalkedTick[]): SweepWalks {
  return {
    stampOf: WITHIN_SHARE.stampOf,
    carryOf: (sweep) => recordingCarry(WITHIN_SHARE.carryOf(sweep), walked),
  }
}

function recordingCarry(walk: CarryWalk, walked: WalkedTick[]): CarryWalk {
  return (sweep, purse, ground) => {
    const reach = walk(sweep, purse, ground)
    walked.push({ path: sweep.path, reach, carriedIn: purse.subSteps - DRILL_SUBSTEPS_PER_TICK })
    return reach
  }
}

/** The tick's ledger as fix A charges it, from the carry the carve's clamp kept. */
function tickChargeOf(
  { path, reach, carriedIn }: WalkedTick,
  carved: SweptCarve | null,
): TickCharge {
  const kept = carved?.carrySubSteps ?? reach.carrySubSteps
  const carve = (charged: CarryReach) => dwellLedgerOf(path, charged, carriedIn)
  const ledger = chargedCarveOf(carve, () => ({ ...reach, carrySubSteps: kept }), reach).carved
  return {
    charged: ledger.reduce((sum, { work }) => sum + work, 0),
    paid: reach.paidPrices.reduce((sum, price) => sum + price, 0),
    walked: reach.carrySubSteps,
    kept,
    carriedIn,
    dropped: droppedCarryInOf({ ...reach, carrySubSteps: kept }, carriedIn),
  }
}

/** A leg's charge in sub-steps: what its ledgers charged and its walks spent. */
export interface LegCharge {
  ticks: number
  charged: number
  /** Paid prices plus the final carry. */
  spent: number
  dropped: number
}

export function legChargeOf(charges: readonly TickCharge[]): LegCharge {
  const sum = (part: (charge: TickCharge) => number) =>
    charges.reduce((total, charge) => total + part(charge), 0)
  const finalCarry = charges.at(-1)?.kept ?? 0
  return {
    ticks: charges.length,
    charged: sum(({ charged }) => charged),
    spent: sum(({ paid }) => paid) + finalCarry,
    dropped: sum(({ dropped }) => dropped),
  }
}

/**
 * The ticks after which the leg so far charged other than its paid prices, the carry kept then and
 * the carried-in work dropped: none when work charged equals work spent at every stop.
 */
export function unconservedTicksOf(charges: readonly TickCharge[]): number[] {
  return charges.flatMap((_, tick) => {
    const { charged, spent, dropped } = legChargeOf(charges.slice(0, tick + 1))
    return charged === spent + dropped ? [] : [tick]
  })
}

/** The leg's charged work over its spent work, less 1: the over-charge VS bounds at 8%. */
export function overChargeOf({ charged, spent }: LegCharge): number {
  return spent === 0 ? 0 : charged / spent - 1
}

/** The VS bound on a leg's over-charge (TD decision record 6208695039, GD 6208709630). */
export const OVER_CHARGE_BOUND = 0.08

/** The TD's base rig, 3600 / 720 m/s, below `SPEED_RIGS`. */
export const CRAWL_RIG: SpeedRig = { speed: 5, subSteps: 720 }

/** The rigs the TD measured fix A on, 5 to 3600 m/s. */
export const CHARGE_RIGS: readonly SpeedRig[] = [
  CRAWL_RIG,
  ...[25, 44, 78, 240, 300, 3600].map(rigAt),
]

export const CHARGE_LEGS: readonly { name: string; leg: Leg }[] = [
  { name: 'column', leg: COLUMN_LEG },
  { name: 'tilted', leg: TILTED_LEG },
]

/** Where a leg starts in the tick's dither phase and along its line (the TD's phases on #441). */
export interface ChargePhase {
  startTick: number
  offsetMm: number
}

/** The TD's 100 m window, with the stamp's reach either side. */
const WINDOW_MM = 100_000 + 2 * DRILL_STAMP_RADIUS_MM
const WINDOW_MAX_TICKS = 2_500

/** A leg cut through the recorder, and each tick's charge. */
export interface ChargedLeg {
  run: LegRun
  charges: TickCharge[]
}

export function chargedLegOf(cut: LegCut): ChargedLeg {
  const charges: TickCharge[] = []
  const run = cutLeg({ ...cut, tick: recordingChargesTick(charges) })
  return { run, charges }
}

/** The rig down the window of `leg`, started at `phase`. */
export function chargedWindowOf(rig: SpeedRig, leg: Leg, phase: ChargePhase): ChargedLeg {
  return chargedLegOf({
    rig,
    leg: { ...leg, start: pointAlong(leg, phase.offsetMm) },
    startTick: phase.startTick,
    maxTicks: WINDOW_MAX_TICKS,
    reachMm: WINDOW_MM,
  })
}

/** One printed row: the leg's ticks, charged and spent work, the residual and the over-charge. */
export function chargeRowLineOf(label: string, charge: LegCharge): string {
  const over = (overChargeOf(charge) * 100).toFixed(2)
  const { ticks, charged, spent, dropped } = charge
  return `${label}: ticks ${ticks}, charged ${charged}, spent ${spent}, droppedCarryIn ${dropped}, over ${over}%`
}
