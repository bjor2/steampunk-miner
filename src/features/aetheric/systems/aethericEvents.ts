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
  }
}

export type WhistleSounded = DomainEventBodies['aetheric.WhistleSounded']
export type PocketOpened = DomainEventBodies['aetheric.PocketOpened']
export type HeatCondensed = DomainEventBodies['aetheric.HeatCondensed']

/**
 * Why a whistle or governor press did not act (`power_up_refused.reason`): the tank cannot pay
 * the blow, or the pocket's first tick.
 */
export const ENERGY_SHORT = 'aetheric.energy_short'
/** Why a condenser press did not act: the tank is already full. */
export const TANK_FULL = 'aetheric.tank_full'
/** Why a condenser press did not act: the item heat gauge holds less than one exchange. */
export const NO_HEAT = 'aetheric.no_heat'

/** Every reason an aetheric press is refused, for the logs and the card checks. */
export const AETHERIC_REFUSALS = [ENERGY_SHORT, TANK_FULL, NO_HEAT] as const

export function whistleSoundedOf(body: WhistleSounded) {
  return { type: 'aetheric.WhistleSounded' as const, ...body }
}

export function pocketOpenedOf(body: PocketOpened) {
  return { type: 'aetheric.PocketOpened' as const, ...body }
}

export function heatCondensedOf(body: HeatCondensed) {
  return { type: 'aetheric.HeatCondensed' as const, ...body }
}
