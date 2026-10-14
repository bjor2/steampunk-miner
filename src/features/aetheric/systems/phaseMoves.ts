/**
 * The phase as it moves (#261, G&V's rules on #261): from the act, the vehicle glides through the
 * kernel's motion seam (`vehicleMotionEffects`, the glide of ticket 390) in a straight line at a
 * constant speed to the centre of its landing cell, arriving at rest on the move's last tick, with
 * input locked, gravity paused and the body passing through the phased cell's walls. The phase clock
 * (`clockSteps`) runs each tick a phase is under way: at the move's last tick it lands the vehicle
 * (`PhaseLanded`, a chime) and clears the record, so a finished phase leaves the section, the save
 * and the digest. If the landing cell stops being open before then (rubble, an enemy) the move
 * reverses toward the start cell over the ticks already spent (`PhaseReversed`, a light clank),
 * and lands there (`PhaseReturned`); nothing is refunded, and the vehicle is never left in solid
 * ground. With no phase under way the clock names no tick and the motion is null, so nothing
 * changes. Players are taken in id order.
 *
 * The slot's ring fills over the move (`holdOf`); a refused phase clanks lightly like a cancelled
 * hold (`slotHoldCues`, ticket 253), the lock's `playClank('light')`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type { SlotHoldCueSource, SlotHoldEnd } from '../../../systems/registries/slotHoldCues'
import type {
  MotionGlide,
  VehicleMotionEffect,
  VehicleMotionEffectSource,
} from '../../../systems/registries/vehicleMotionEffects'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { SlotHold } from '../../power-up-core'
import { PHASE_REFUSALS, phaseLandedOf, phaseReturnedOf, phaseReversedOf } from './aethericEvents'
import { LANTERN_ID } from './lanternItem'
import { isLandingOpen } from './phaseLantern'
import { NOT_PHASING, phaseOf, withPhase, type PhaseMove } from './phaseSection'

export const PHASE_MOTION: VehicleMotionEffectSource = {
  id: 'aetheric.phase-lantern',
  effectOf: (state, playerId, tick) => motionOf(state, playerId, tick),
}

export const PHASE_CLOCK: ClockStep = {
  id: 'aetheric.phases',
  nextTick: (state) => (phasingPlayerIdsOf(state).length === 0 ? null : state.tick + 1),
  run: stepPhases,
}

/** A finished move chimes, a reversed or refused one clanks lightly (G&V on #261). */
export const PHASE_HOLD_CUES: SlotHoldCueSource = {
  id: 'aetheric.phase-lantern',
  holdEndOf: phaseHoldEndOf,
}

/** The move as the slot's ring shows it; null with no phase under way. */
export function phaseHoldOf(state: AuthorityState, playerId: string): SlotHold | null {
  const phase = phaseOf(state, playerId).phase
  return phase === null ? null : { startTick: phase.startTick, finishTick: phase.endTick }
}

/**
 * A glide through the phased cell to the landing cell's centre, at rest by the move's end; none
 * once the vehicle is towed to the dock, which the tow has already placed.
 */
function motionOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleMotionEffect | null {
  const phase = phaseOf(state, playerId).phase
  if (phase === null || tick >= phase.endTick) return null
  if (vehicleOf(state, playerId).mode === 'docked') return null
  return { glide: glideOf(phase) }
}

function glideOf(phase: PhaseMove): MotionGlide {
  return {
    to: { tx: phase.toTx, ty: phase.toTy },
    untilTick: phase.endTick,
    passThrough: { tx: phase.cellTx, ty: phase.cellTy },
  }
}

function phaseHoldEndOf(event: DomainEvent): SlotHoldEnd | null {
  if (event.type === 'aetheric.PhaseLanded') return 'finished'
  if (event.type === 'aetheric.PhaseReversed') return 'cancelled'
  return isRefusedPhase(event) ? 'cancelled' : null
}

/** A press of the lantern refused for one of the phase's own reasons. */
export function isRefusedPhase(event: DomainEvent): boolean {
  if (event.type !== 'power-up-core.PowerUpRefused') return false
  return event.itemId === LANTERN_ID && PHASE_REFUSALS.includes(event.reason)
}

function stepPhases(state: AuthorityState, tick: number): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  return phasingPlayerIdsOf(state).reduce<RuleEffect>(
    (effect, playerId) => chainPhaseStep(effect, params, playerId, tick),
    unchanged(state),
  )
}

function chainPhaseStep(
  effect: RuleEffect,
  params: PlanetParams,
  playerId: string,
  tick: number,
): RuleEffect {
  const step = stepPhaseOf(effect.state, params, playerId, tick)
  return { state: step.state, events: [...effect.events, ...step.events] }
}

/** Lands a move at its last tick; reverses one whose landing cell has closed; else leaves it. */
function stepPhaseOf(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tick: number,
): RuleEffect {
  const phase = phaseOf(state, playerId).phase
  if (phase === null) return unchanged(state)
  if (tick >= phase.endTick) return landPhase(state, playerId, phase)
  if (phase.isReturning || isLandingOpen(state, params, landingOf(phase))) return unchanged(state)
  return reversePhase(state, playerId, phase, tick)
}

function landPhase(state: AuthorityState, playerId: string, phase: PhaseMove): RuleEffect {
  return {
    state: withPhase(state, playerId, NOT_PHASING),
    events: [landedEventOf(playerId, phase)],
  }
}

function landedEventOf(playerId: string, phase: PhaseMove): DomainEventBody {
  const { tx, ty } = landingOf(phase)
  return phase.isReturning
    ? phaseReturnedOf({ playerId, tx, ty })
    : phaseLandedOf({ playerId, tx, ty })
}

/** Back toward the start cell over the ticks already spent; none spent lands there at once. */
function reversePhase(
  state: AuthorityState,
  playerId: string,
  phase: PhaseMove,
  tick: number,
): RuleEffect {
  const spent = tick - phase.startTick
  const reversed = reversedMoveOf(phase, tick, spent)
  const turned = withPhase(state, playerId, { phase: reversed })
  const reversedEvent = phaseReversedOf({
    playerId,
    tx: reversed.toTx,
    ty: reversed.toTy,
    ticks: spent,
  })
  if (spent > 0) return { state: turned, events: [reversedEvent] }
  const landed = landPhase(turned, playerId, reversed)
  return { state: landed.state, events: [reversedEvent, ...landed.events] }
}

function reversedMoveOf(phase: PhaseMove, tick: number, spent: number): PhaseMove {
  return {
    ...phase,
    fromTx: phase.toTx,
    fromTy: phase.toTy,
    toTx: phase.fromTx,
    toTy: phase.fromTy,
    startTick: tick,
    endTick: tick + spent,
    isReturning: true,
  }
}

function landingOf(phase: PhaseMove) {
  return { tx: phase.toTx, ty: phase.toTy }
}

function phasingPlayerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => phaseOf(state, playerId).phase !== null)
}
