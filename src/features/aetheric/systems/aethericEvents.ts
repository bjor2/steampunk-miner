/**
 * The domain events, refusal reasons and debug command the aetheric lane adds (feature-slices.md
 * 3.15), by augmentation, never by editing the kernel's lists. `power-up-core` already logs every
 * use as `power_up_used`; the lock on #245 wants one `aetheric.*` event beside it saying what the
 * use did.
 *
 * The events name their player: an act resolves on the authority clock after its wind-up, whose
 * events carry no command stamp.
 */
import type { DomainEventBodies } from '../../../systems/authority/domainEvent'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** A scenario's item heat, in heat units, at most the gauge's max (#263). */
    'debug.aetheric.setItemHeat': { heat: number }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /**
     * The resonance whistle sounded on tile (`tx`, `ty`): hunters within `reachTiles` of it path
     * there for `durationTicks`, and `energy` quanta left the tank (#262).
     */
    'aetheric.WhistleSounded': {
      playerId: string
      itemId: string
      tx: number
      ty: number
      reachTiles: number
      durationTicks: number
      energy: number
    }
    /**
     * The chronometric governor opened a slow pocket on tile (`tx`, `ty`) (#263): enemies within
     * `rangeTiles` of it step at half speed for `durationTicks` while the tank pays
     * `energyPerTick` quanta a tick, and `heat` units went onto the item heat gauge.
     */
    'aetheric.PocketOpened': {
      playerId: string
      itemId: string
      tx: number
      ty: number
      rangeTiles: number
      durationTicks: number
      energyPerTick: number
      heat: number
    }
    /** The aether condenser burnt `heat` units off the item heat gauge into `energy` quanta (#263). */
    'aetheric.HeatCondensed': {
      playerId: string
      itemId: string
      heat: number
      energy: number
    }
    /**
     * The phase lantern started a phase (#261): the vehicle crosses cell (`cellTx`, `cellTy`),
     * which stays as it is, to land in (`toTx`, `toTy`) over `ticks` ticks, the ticks the bit would
     * have needed on that cell, for `energy` quanta and `heat` units on the item gauge.
     */
    'aetheric.PhaseStarted': {
      playerId: string
      itemId: string
      cellTx: number
      cellTy: number
      toTx: number
      toTy: number
      ticks: number
      energy: number
      heat: number
    }
    /** The phase ended with the vehicle at rest in its landing cell (`tx`, `ty`) (#261). */
    'aetheric.PhaseLanded': { playerId: string; tx: number; ty: number }
    /**
     * The landing cell stopped being open mid-phase (#261): the phase reverses to the start cell
     * (`tx`, `ty`) over `ticks` ticks, the ticks already spent; nothing is refunded.
     */
    'aetheric.PhaseReversed': { playerId: string; tx: number; ty: number; ticks: number }
    /** A reversed phase ended with the vehicle back in its start cell (`tx`, `ty`) (#261). */
    'aetheric.PhaseReturned': { playerId: string; tx: number; ty: number }
    /**
     * The galvanic arc coil fired a bolt (#261): it hit `targets` enemies (the nearest, then the
     * chain), each for `damage`, one auto-gun shot at the current drill power, as a canonical
     * string, for `energy` quanta and `heat` units on the item gauge.
     */
    'aetheric.ArcFired': {
      playerId: string
      itemId: string
      targets: number
      damage: string
      energy: number
      heat: number
    }
  }
}

export type WhistleSounded = DomainEventBodies['aetheric.WhistleSounded']
export type PocketOpened = DomainEventBodies['aetheric.PocketOpened']
export type HeatCondensed = DomainEventBodies['aetheric.HeatCondensed']
export type PhaseStarted = DomainEventBodies['aetheric.PhaseStarted']
export type PhaseLanded = DomainEventBodies['aetheric.PhaseLanded']
export type PhaseReversed = DomainEventBodies['aetheric.PhaseReversed']
export type PhaseReturned = DomainEventBodies['aetheric.PhaseReturned']
export type ArcFired = DomainEventBodies['aetheric.ArcFired']

/**
 * Why a whistle or governor press did not act (`power_up_refused.reason`): the tank cannot pay
 * the blow, or the pocket's first tick.
 */
export const ENERGY_SHORT = 'aetheric.energy_short'
/** Why a condenser press did not act: the tank is already full. */
export const TANK_FULL = 'aetheric.tank_full'
/** Why a condenser press did not act: the item heat gauge holds less than one exchange. */
export const NO_HEAT = 'aetheric.no_heat'

/** Why a lantern press did not act: the cell ahead is already open, so there is nothing to phase. */
export const NOTHING_AHEAD = 'aetheric.nothing_ahead'
/** Why a lantern press did not act: the cell ahead is the dock pad or lava, which no drill removes. */
export const CELL_LOCKED = 'aetheric.cell_locked'
/** Why a lantern press did not act: the cell ahead is too hard for the tip to scratch. */
export const CELL_DENSE = 'aetheric.cell_dense'
/** Why a lantern press did not act: a gate (#142's `canMine`) keeps the cell ahead standing. */
export const CELL_GATED = 'aetheric.cell_gated'
/** Why a lantern press did not act: the cell ahead is the core, which is harvested, never skipped. */
export const CORE_CELL = 'aetheric.core_cell'
/** Why a lantern press did not act: the cell beyond the phased one is not open air or tunnel. */
export const NO_LANDING = 'aetheric.no_landing'
/** Why a lantern press did not act: a phase is already under way. */
export const PHASING = 'aetheric.phasing'
/** Why an arc coil press did not act: no enemy stands within the bolt's reach. */
export const NO_TARGET = 'aetheric.no_target'

/** Every reason a phase is refused: a light clank and a flicker, nothing spent (G&V on #261). */
export const PHASE_REFUSALS: readonly string[] = [
  NOTHING_AHEAD,
  CELL_LOCKED,
  CELL_DENSE,
  CELL_GATED,
  CORE_CELL,
  NO_LANDING,
  PHASING,
  ENERGY_SHORT,
]

/** Every reason an aetheric press is refused, for the logs and the card checks. */
export const AETHERIC_REFUSALS = [...PHASE_REFUSALS, TANK_FULL, NO_HEAT, NO_TARGET] as const

export function whistleSoundedOf(body: WhistleSounded) {
  return { type: 'aetheric.WhistleSounded' as const, ...body }
}

export function pocketOpenedOf(body: PocketOpened) {
  return { type: 'aetheric.PocketOpened' as const, ...body }
}

export function heatCondensedOf(body: HeatCondensed) {
  return { type: 'aetheric.HeatCondensed' as const, ...body }
}

export function phaseStartedOf(body: PhaseStarted) {
  return { type: 'aetheric.PhaseStarted' as const, ...body }
}

export function phaseLandedOf(body: PhaseLanded) {
  return { type: 'aetheric.PhaseLanded' as const, ...body }
}

export function phaseReversedOf(body: PhaseReversed) {
  return { type: 'aetheric.PhaseReversed' as const, ...body }
}

export function phaseReturnedOf(body: PhaseReturned) {
  return { type: 'aetheric.PhaseReturned' as const, ...body }
}

export function arcFiredOf(body: ArcFired) {
  return { type: 'aetheric.ArcFired' as const, ...body }
}
