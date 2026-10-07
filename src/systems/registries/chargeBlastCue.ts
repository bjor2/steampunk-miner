/**
 * How a charge's blast kicks the local player (#213, from the TD's #145 seam lock): the screen's
 * shake and flash and how many ticks the thump waits, from the detonation and how far from it the
 * player's vehicle stands. One provider at most (`dynamite-visuals`); with none, every blast kicks
 * as the shipped charge always has. The kernel clamps what a provider answers, and the player's
 * shake and flash switches still decide whether any of it shows. Presentation only: nothing here
 * reaches the authority state, a snapshot or a digest.
 */
import type { DomainEvent } from '../authority/domainEvent'
import { defineOneProviderRegistry, entriesOf } from './seal'

export type ChargeDetonatedEvent = Extract<DomainEvent, { type: 'ChargeDetonated' }>

export interface ChargeBlastKick {
  /** 0 to 1, added to the screen's shake. */
  shake: number
  /** 0 to 1, a share of the flash cap. */
  flash: number
  /** Ticks the blast's sound waits, 0 to `MAX_THUMP_DELAY_TICKS`. */
  thumpDelayTicks: number
}

export interface ChargeBlastCueProvider {
  id: string
  kickOf(detonated: ChargeDetonatedEvent, distanceMm: number): ChargeBlastKick
}

/** The shipped charge's kick (#109): a hard shake, no flash, the sound at once. */
export const SHIPPED_CHARGE_BLAST_KICK: Readonly<ChargeBlastKick> = Object.freeze({
  shake: 0.8,
  flash: 0,
  thumpDelayTicks: 0,
})

/** A thump waits at most a second of ticks (#213). */
export const MAX_THUMP_DELAY_TICKS = 60

export const CHARGE_BLAST_CUE_REGISTRY =
  defineOneProviderRegistry<ChargeBlastCueProvider>('chargeBlastCue')

/** The provider's kick, clamped; the shipped charge's with no provider. */
export function chargeBlastKickOf(
  detonated: ChargeDetonatedEvent,
  distanceMm: number,
): ChargeBlastKick {
  return clampedKick(providedKickOf(detonated, distanceMm))
}

function providedKickOf(detonated: ChargeDetonatedEvent, distanceMm: number): ChargeBlastKick {
  const [provider] = entriesOf(CHARGE_BLAST_CUE_REGISTRY)
  return provider?.kickOf(detonated, distanceMm) ?? SHIPPED_CHARGE_BLAST_KICK
}

function clampedKick(kick: ChargeBlastKick): ChargeBlastKick {
  return {
    shake: clampedBetween(kick.shake, 0, 1),
    flash: clampedBetween(kick.flash, 0, 1),
    thumpDelayTicks: clampedBetween(Math.round(kick.thumpDelayTicks), 0, MAX_THUMP_DELAY_TICKS),
  }
}

/** A value that is not a number is no kick: the lower bound. */
function clampedBetween(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) return low
  return Math.min(high, Math.max(low, value))
}
