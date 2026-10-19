/**
 * How a swept cut's tick settles (tickets 330 and 335, split from `sweptDrill.ts`): the cursor
 * moves to where the cut reached with what it left of its per-cell share (`cutShare.ts`) and the
 * work it carries to the next tick (ticket 399, `vehicle/carryWalk.ts`), a
 * standing cell is reported once as the sweep meets it, and the casing rings the cut makes due are
 * laid in order along it, their cells taken off the share passed on. The cursor also sums the dig
 * time of the cells the steps broke since the last charged report, which that report heats from.
 *
 * A step that continues its cursor leaves out the gated cells its start's disc already reached, and
 * one that made no headway reports none, so holding the drill against a gate does not repeat it
 * every tick. The cursor keeps the step's own position, from which the next step's bound is
 * measured, and the cut gate read before the cut (`cutFollowRead.ts`, ticket 333). Its dig time
 * and carry count in the tick's drill quantum, which it keeps when above the base (ticket 558).
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import type { CutAxis } from '../vehicle/casingTrail'
import { isCutGateOpen } from '../vehicle/cutGate'
import {
  digSubStepsAfter,
  frontOfCursor,
  pointAtStep,
  type SweepPath,
  type SweptCut,
} from '../vehicle/sweptCut'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { discSamplesOf, type DiscStamp, type StampPoint } from '../world/stampShape'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { layCasingAlongCut } from './casingPlacement'
import { chainEffects, type RuleEffect } from './commandRule'
import { sharePassedAfterRings, sharePassedOf } from './cutShare'
import type { DomainEventBody } from './domainEvent'
import type { DrillOutcome } from './groundDrill'
import { carryLeftAfter } from './sweptCarry'
import type { Sweep, SweptCarve } from './sweptDrill'

function tileKeyOfSample(sx: number, sy: number): string {
  return `${Math.floor(sx / SAMPLES_PER_TILE)},${Math.floor(sy / SAMPLES_PER_TILE)}`
}

/** A tick's sweep and the dig time of the cells it broke, in sub-steps (`drillCutTally.ts`). */
export interface SweptTickCut {
  sweep: Sweep
  digSubSteps: number
}

/**
 * The cursor moves to the cut's reach with what it left of its share, standing cells are reported
 * once, rings follow the cut and take their cells off the share passed on.
 */
export function settleSweep(
  outcome: DrillOutcome<SweptCarve>,
  playerId: string,
  { sweep, digSubSteps }: SweptTickCut,
): RuleEffect {
  const { effect, carved } = outcome
  if (carved === null) return effect
  const reached = reachedPointOf(sweep.path, carved.reachedStep)
  const passed = sharePassedOf(sweep.share, carved.cells)
  const carrySubSteps = carryLeftAfter(effect.state, playerId, carved.carrySubSteps)
  const reach = { reached, passed, digSubSteps, carrySubSteps, front: carved.front }
  return chainEffects(effect.state, [
    (current) => ({
      state: withCursorAt(current, playerId, sweep, reach),
      events: withoutStandingMetBefore(
        effect.events,
        { sweep, cursor: vehicleOf(effect.state, playerId).sweptCut },
        carved.reachedStep,
      ),
    }),
    (current) => layRingsAlongCut(current, playerId, cutAxisOf(sweep.path, reached), carved),
  ])
}

/** The rings the cut makes due, laid in order, their cells off the share the cursor passes on. */
function layRingsAlongCut(
  state: AuthorityState,
  playerId: string,
  axis: CutAxis,
  carved: SweptCarve,
): RuleEffect {
  const laid = layCasingAlongCut(state, playerId, axis, carved.ticksUsed > 0)
  return { state: withRingsOffShare(laid.state, playerId, laid.events), events: laid.events }
}

function withRingsOffShare(
  state: AuthorityState,
  playerId: string,
  ringEvents: readonly DomainEventBody[],
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const cursor = vehicle.sweptCut as SweptCut
  const cutSharePassed = sharePassedAfterRings(cursor.cutSharePassed, ringEvents)
  return withVehicle(state, playerId, { ...vehicle, sweptCut: { ...cursor, cutSharePassed } })
}

/** The line the stamp's centre cut along: from the cursor, or a fresh path's one disc. */
function cutAxisOf(path: SweepPath, reached: StampPoint): CutAxis {
  return { from: path.isFresh ? reached : path.from, to: reached }
}

/** A fresh path that could cut nothing stays at its start: the body. */
function reachedPointOf(path: SweepPath, reachedStep: number): StampPoint {
  return pointAtStep(path, Math.max(0, reachedStep))
}

/**
 * Where a step's cut reached, what it left of its share for the next player, its dig time and the
 * work it carries.
 */
interface CursorReach {
  reached: StampPoint
  passed: number
  digSubSteps: number
  carrySubSteps: number
  /** Where a bite left the front past the reach (ticket 570); absent with none. */
  front?: StampPoint
}

function withCursorAt(
  state: AuthorityState,
  playerId: string,
  { step, gate, quantum }: Sweep,
  { reached, passed, digSubSteps, carrySubSteps, front }: CursorReach,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const dig = digSubStepsAfter(vehicle.sweptCut, vehicle.accountedTick, digSubSteps, quantum)
  const cursor: SweptCut = {
    ...reached,
    poseXMm: step.pose.x,
    poseYMm: step.pose.y,
    facing: step.pose.facing,
    tick: state.tick,
    ...gate,
    cutSharePassed: passed,
    digSubSteps: dig,
    carrySubSteps,
    ...quantumKeyOf(quantum),
    ...(front === undefined ? {} : { front }),
  }
  return withVehicle(state, playerId, { ...vehicle, sweptCut: cursor })
}

/** The cursor's quantum key: left out at the base, so a base cursor digests as before. */
function quantumKeyOf(quantum: number): { quantum?: number } {
  return quantum === DRILL_SUBSTEPS_PER_TICK ? {} : { quantum }
}

/**
 * `DrillGated` refused or blocked only where the sweep newly met the cell: a fresh step reports
 * all. A travelling step reports none when it made no headway, else none its start's disc already
 * reached. A cutting step's stamp sits at its front (ticket 570), which may bite on while the walk's
 * cursor stays put, so it reports any its stamp met that the stamps since the cursor did not.
 */
function withoutStandingMetBefore(
  events: readonly DomainEventBody[],
  { sweep, cursor }: SettledSweep,
  reachedStep: number,
): DomainEventBody[] {
  if (sweep.path.isFresh) return [...events]
  const isCutting = isCutGateOpen(sweep.gate)
  const metBefore = isCutting ? cellsMetSinceCursor(sweep, cursor) : cellsMetAtStart(sweep)
  const hasHeadway = reachedStep > 0 || isCutting
  const isNewlyMet = (event: DomainEventBody) =>
    !isStandingGate(event) || (hasHeadway && !metBefore.has(`${event.tx},${event.ty}`))
  return events.filter(isNewlyMet)
}

/** A tick's sweep, and the cursor it continues. */
interface SettledSweep {
  sweep: Sweep
  cursor: SweptCut | undefined
}

/** The cells a travelling step's start already met: its stamp's disc there. */
function cellsMetAtStart({ stamp, path }: Pick<Sweep, 'stamp' | 'path'>): Set<string> {
  return cellsOfDisc({ ...stamp, ...path.from, tail: undefined })
}

/**
 * The cells a cutting step's stamp met on the step before: its capsule from that step's rear (this
 * step's, moved back by the body's step since) to where that step's front stood (a bite's, stored
 * on the cursor, or the reach). This step's carve runs from its rear too (`sweptCarve.ts`).
 */
function cellsMetSinceCursor({ stamp, step, rear }: Sweep, cursor: SweptCut | undefined) {
  if (cursor === undefined) return new Set<string>()
  const lastRear = {
    xMm: rear.xMm - (step.pose.x - cursor.poseXMm),
    yMm: rear.yMm - (step.pose.y - cursor.poseYMm),
  }
  return cellsOfDisc({ ...stamp, ...frontOfCursor(cursor), tail: lastRear })
}

function cellsOfDisc(disc: DiscStamp): Set<string> {
  return new Set(discSamplesOf(disc).map(({ sx, sy }) => tileKeyOfSample(sx, sy)))
}

function isStandingGate(
  event: DomainEventBody,
): event is Extract<DomainEventBody, { type: 'DrillGated' }> {
  return event.type === 'DrillGated' && event.outcome !== 'lost'
}
