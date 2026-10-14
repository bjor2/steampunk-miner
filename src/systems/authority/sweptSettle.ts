/**
 * How a swept cut's tick settles (tickets 330 and 335, split from `sweptDrill.ts`): the cursor
 * moves to where the cut reached with what it left of its per-cell share (`cutShare.ts`), a
 * standing cell is reported once as the sweep meets it, and the casing rings the cut makes due are
 * laid in order along it, their cells taken off the share passed on.
 *
 * A step that continues its cursor leaves out the gated cells its start's disc already reached, and
 * one that made no headway reports none, so holding the drill against a gate does not repeat it
 * every tick. The cursor keeps the step's own position, from which the next step's bound is
 * measured, and the cut gate read before the cut (`cutFollowRead.ts`, ticket 333).
 */
import type { CutAxis } from '../vehicle/casingTrail'
import { pointAtStep, type SweepPath, type SweptCut } from '../vehicle/sweptCut'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { discSamplesOf, type DiscStamp, type StampPoint } from '../world/stampShape'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { layCasingAlongCut } from './casingPlacement'
import { chainEffects, type RuleEffect } from './commandRule'
import { sharePassedAfterRings, sharePassedOf } from './cutShare'
import type { DomainEventBody } from './domainEvent'
import type { DrillOutcome } from './groundDrill'
import type { Sweep, SweptCarve } from './sweptDrill'

function tileKeyOfSample(sx: number, sy: number): string {
  return `${Math.floor(sx / SAMPLES_PER_TILE)},${Math.floor(sy / SAMPLES_PER_TILE)}`
}

/**
 * The cursor moves to the cut's reach with what it left of its share, standing cells are reported
 * once, rings follow the cut and take their cells off the share passed on.
 */
export function settleSweep(
  outcome: DrillOutcome<SweptCarve>,
  playerId: string,
  sweep: Sweep,
): RuleEffect {
  const { effect, carved } = outcome
  if (carved === null) return effect
  const reached = reachedPointOf(sweep.path, carved.reachedStep)
  const passed = sharePassedOf(sweep.share, carved.cells)
  return chainEffects(effect.state, [
    (current) => ({
      state: withCursorAt(current, playerId, sweep, { reached, passed }),
      events: withoutStandingMetBefore(effect.events, sweep, carved.reachedStep),
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

/** Where a step's cut reached, and what it left of its share for the next player. */
interface CursorReach {
  reached: StampPoint
  passed: number
}

function withCursorAt(
  state: AuthorityState,
  playerId: string,
  { step, gate }: Sweep,
  { reached, passed }: CursorReach,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const cursor: SweptCut = {
    ...reached,
    poseXMm: step.pose.x,
    poseYMm: step.pose.y,
    facing: step.pose.facing,
    tick: state.tick,
    ...gate,
    cutSharePassed: passed,
  }
  return withVehicle(state, playerId, { ...vehicle, sweptCut: cursor })
}

/**
 * `DrillGated` refused or blocked only where the sweep newly met the cell: a fresh step reports
 * all; a continuing one none when it made no headway, else none its start's disc already reached.
 */
function withoutStandingMetBefore(
  events: readonly DomainEventBody[],
  sweep: Sweep,
  reachedStep: number,
): DomainEventBody[] {
  if (sweep.path.isFresh) return [...events]
  const metBefore = cellsOfDisc({ ...sweep.stamp, ...sweep.path.from, tail: undefined })
  const isNewlyMet = (event: DomainEventBody) =>
    !isStandingGate(event) || (reachedStep > 0 && !metBefore.has(`${event.tx},${event.ty}`))
  return events.filter(isNewlyMet)
}

function cellsOfDisc(disc: DiscStamp): Set<string> {
  return new Set(discSamplesOf(disc).map(({ sx, sy }) => tileKeyOfSample(sx, sy)))
}

function isStandingGate(
  event: DomainEventBody,
): event is Extract<DomainEventBody, { type: 'DrillGated' }> {
  return event.type === 'DrillGated' && event.outcome !== 'lost'
}
