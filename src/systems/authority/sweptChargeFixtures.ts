/**
 * A recorder on the swept carve for the conservation specs (ticket 466, GD 6209400700 Q2 (i)).
 * The dwell ledger stays out of the loop until #441's ring re-run, so a leg's ticks are cut through
 * the carve's own walk seam (`SweepWalks`, the live `drillStep`'s walks), which records each tick's
 * walk; its ledger is then charged as fix A charges it (`clampedCharge.ts`), from the carry the
 * release clamp kept. Only specs use it.
 *
 * Counted by tick (GD 6209400700 Q1 (c)): over a leg, the ledgers charge the paid prices, the
 * final carry and the carried-in work later ticks drop, to the sub-step, at every tick.
 *
 * The debt recorder (ticket 471's slice 1, ticket 503) holds the carry debt from tick to tick, as
 * #466's recorder held the carried-in work: each tick's ledger pays the debt the tick before left,
 * so the ledgers charge the paid prices, the stored carry and the debt still owed.
 */
import { drillStampRadiusMm } from '../vehicle/drillBore'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { CarryReach, CarryWalk } from '../vehicle/carryWalk'
import { NO_DRIVE } from '../vehicle/driveSigns'
import {
  carryDebtAfter,
  carryDebtAfterTank,
  carryDebtOwedOn,
  droppedCarryInOf,
  dwellLedgerOf,
} from '../vehicle/sweepDwell'
import type { SweepPath } from '../vehicle/sweptCut'
import { noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { vehicleOf, type AuthorityState } from './authorityState'
import { chargedCarveOf } from './clampedCharge'
import { WITHIN_SHARE } from './drillStepCut'
import { PARAMS } from './scriptedSession'
import { drillSweepBy, type Sweep, type SweepWalks, type SweptCarve } from './sweptDrill'
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
  /** The carry debt the tick's ledger paid toward: 0 on fix A's recorder and on a fresh path. */
  owed: number
  /** The carry debt the tick leaves: what it could not pay, what it dropped, what the tank did. */
  owes: number
  /** The carry the cursor stores after the settle: the kept carry, none once the tank empties. */
  stored: number
}

/** A tick's walk as the carve's walk seam saw it. */
interface WalkedTick {
  path: SweepPath
  reach: CarryReach
  carriedIn: number
}

/** How a leg's ticks are cut and charged: by fix A's ledger, or one holding the carry debt. */
export type ChargeRecorder = (charges: TickCharge[]) => LegTick

/** The leg's swept tick, cut by the live `drillStep`'s walks, its walk's charge kept in `charges`. */
export const recordingChargesTick: ChargeRecorder = (charges) =>
  recordingTickOwing(() => 0, charges)

/** The same tick with its ledger paying the debt the last recorded tick left (ticket 471). */
export const recordingDebtTick: ChargeRecorder = (charges) =>
  recordingTickOwing((path) => carryDebtOwedOn(path, charges.at(-1)?.owes ?? 0), charges)

/** The recorded tick, its ledger paying what `owedOn` says its path owes. */
function recordingTickOwing(owedOn: (path: SweepPath) => number, charges: TickCharge[]): LegTick {
  return (state, tick, pose) => {
    const walked: WalkedTick[] = []
    const outcome = drillSweepBy(
      { ...state, tick },
      PARAMS,
      'p1',
      sweptTickAt(pose),
      recordingWalks(walked),
    )
    const stored = storedCarryOf(outcome.effect.state)
    const debtOf = (walk: WalkedTick) => ({ owed: owedOn(walk.path), stored })
    charges.push(...walked.map((walk) => tickChargeOf(walk, outcome.carved, debtOf(walk))))
    return outcome.effect
  }
}

function storedCarryOf(state: AuthorityState): number {
  return vehicleOf(state, 'p1').sweptCut?.carrySubSteps ?? 0
}

function sweptTickAt(pose: VehiclePose) {
  return { target: noseTileOf(pose), step: { pose, drive: NO_DRIVE, isLifting: false } }
}

/** The live walks, each tick's carry walk recorded into `walked`. */
function recordingWalks(walked: WalkedTick[]): SweepWalks {
  return {
    stampOf: WITHIN_SHARE.stampOf,
    carryOf: (sweep) => recordingCarry(WITHIN_SHARE.carryOf(sweep), { walked, sweep }),
  }
}

/** Where the recorded walks go, and the tick's sweep, whose quantum is the tick's own work. */
interface WalkRecord {
  walked: WalkedTick[]
  sweep: Sweep
}

function recordingCarry(walk: CarryWalk, { walked, sweep }: WalkRecord): CarryWalk {
  return (carrySweep, purse, ground) => {
    const reach = walk(carrySweep, purse, ground)
    walked.push({ path: carrySweep.path, reach, carriedIn: purse.subSteps - sweep.quantum })
    return reach
  }
}

/** The debt a tick's ledger pays toward and the carry its settle stored. */
interface TickDebt {
  owed: number
  stored: number
}

/** The tick's ledger as fix A charges it, from the carry the carve's clamp kept, less `owed`. */
function tickChargeOf(
  { path, reach, carriedIn }: WalkedTick,
  carved: SweptCarve | null,
  { owed, stored }: TickDebt,
): TickCharge {
  const kept = carved?.carrySubSteps ?? reach.carrySubSteps
  const clamped = { ...reach, carrySubSteps: kept }
  const carve = (charged: CarryReach) => dwellLedgerOf(path, charged, carriedIn, owed)
  const ledger = chargedCarveOf(carve, () => clamped, reach).carved
  const owes = carryDebtAfter(clamped, carriedIn, owed)
  return {
    charged: ledger.reduce((sum, { work }) => sum + work, 0),
    paid: reach.paidPrices.reduce((sum, price) => sum + price, 0),
    walked: reach.carrySubSteps,
    kept,
    carriedIn,
    dropped: droppedCarryInOf(clamped, carriedIn),
    owed,
    owes: carryDebtAfterTank(owes, kept, stored),
    stored,
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

/**
 * The TD's base rig, 5 m/s (3600 / 720), below `SPEED_RIGS`. The per-purchase drill of #552 has no
 * purchase at 720 sub-steps a band-1 cell, so it holds the nearer of the two either side: purchase
 * 6 at 804 (4.48 m/s); purchase 7 cuts at 647 (5.56 m/s), where the tilted leg over-charges 8.02%.
 */
export const CRAWL_RIG: SpeedRig = { speed: 5, subSteps: 804 }

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
const WINDOW_MM = 100_000 + 2 * drillStampRadiusMm()
const WINDOW_MAX_TICKS = 2_500
/**
 * A window holds at least this many of the rig's strides: the 3600 m/s rig no longer stops at the
 * old one-sub-step floor (ticket 558), so it would cross the 100 m in two ticks.
 */
const WINDOW_MIN_STRIDES = 3

/** The window a rig cuts: the TD's 100 m, or three of its strides where those are longer. */
function windowMmOf(rig: SpeedRig): number {
  const strideMm = (rig.speed * MM_PER_METRE) / TICKS_PER_SECOND
  return Math.max(WINDOW_MM, WINDOW_MIN_STRIDES * strideMm + 2 * drillStampRadiusMm())
}

/** A leg cut through the recorder, and each tick's charge. */
export interface ChargedLeg {
  run: LegRun
  charges: TickCharge[]
}

export function chargedLegOf(
  cut: LegCut,
  recorder: ChargeRecorder = recordingChargesTick,
): ChargedLeg {
  const charges: TickCharge[] = []
  const run = cutLeg({ ...cut, tick: recorder(charges) })
  return { run, charges }
}

/** The rig down the window of `leg`, started at `phase`. */
export function chargedWindowOf(
  rig: SpeedRig,
  leg: Leg,
  phase: ChargePhase,
  recorder: ChargeRecorder = recordingChargesTick,
): ChargedLeg {
  const cut = {
    rig,
    leg: { ...leg, start: pointAlong(leg, phase.offsetMm) },
    startTick: phase.startTick,
    maxTicks: WINDOW_MAX_TICKS,
    reachMm: windowMmOf(rig),
  }
  return chargedLegOf(cut, recorder)
}

/** One printed row: the leg's ticks, charged and spent work, the residual and the over-charge. */
export function chargeRowLineOf(label: string, charge: LegCharge): string {
  const over = (overChargeOf(charge) * 100).toFixed(2)
  const { ticks, charged, spent, dropped } = charge
  return `${label}: ticks ${ticks}, charged ${charged}, spent ${spent}, droppedCarryIn ${dropped}, over ${over}%`
}
