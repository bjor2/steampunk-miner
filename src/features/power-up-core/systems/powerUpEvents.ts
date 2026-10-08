/**
 * The commands, domain events and rejection reasons `power-up-core` adds (feature-slices.md 3.15),
 * by augmentation, never by editing the kernel's lists; and the event bodies its rules build.
 *
 * Every event names its player: the wind-up and channel resolve on the authority clock, whose
 * events carry no command stamp.
 */
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import type { FollowUpPattern } from './chargeState'
import type { GateBlock } from './powerUpKind'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** #162 section 2.3: press the power-up in a slot (`use_slot_1`-`5`), or a drill socket's gear. */
    'power-up-core.use_power_up': { slot: string }
    /** The item card's switch (ticket 274): turn the item's sibling-link off, or back on. */
    'power-up-core.toggle_link': { itemId: string }
    /**
     * The slot is still held past the wind-up of the use it just made (#256's hold milestone):
     * the hold follows that use as one more action.
     */
    'power-up-core.hold_power_up': { slot: string }
    /**
     * The slot is let go (ticket 332): it ends the hold of an item used by holding it, or is kept
     * for the act when it lands during the wind-up. Anything else is accepted and changes nothing.
     */
    'power-up-core.release_power_up': { slot: string }
    /** A scenario's charges left for one owned power-up. */
    'debug.power-up-core.setCharges': { itemId: string; chargesLeft: number }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'power-up-core.PowerUpUsed': {
      playerId: string
      itemId: string
      slot: LoadoutSlotId
      mark: number
      originTx: number
      originTy: number
      chargesLeft: number
      /** A toggle passive only: whether this use switched it on or off. */
      toggledOn?: boolean
      /** A Mark milestone's follow-up only (#256): which pattern this use was. */
      milestone?: FollowUpPattern
    }
    'power-up-core.PowerUpBlocked': {
      playerId: string
      itemId: string
      slot: LoadoutSlotId
      cellTier: number
      gateKind: string
      tx: number
      ty: number
      chargesLeft: number
    }
    /** The item found nothing to act on (ticket 204: a grapple with no hook); nothing spent. */
    'power-up-core.PowerUpRefused': {
      playerId: string
      itemId: string
      slot: LoadoutSlotId
      reason: string
      chargesLeft: number
    }
    'power-up-core.ChannelCancelled': {
      playerId: string
      itemId: string
      slot: LoadoutSlotId
      chargesLeft: number
    }
    'power-up-core.ChargesRefilled': { playerId: string; itemId: string; chargesLeft: number }
    /**
     * The item's act fired its sibling-link (the GD lock on #256): `siblingId` acted from `slot`,
     * its own, and spent its charge and cooldown.
     */
    'power-up-core.LinkFired': {
      playerId: string
      itemId: string
      siblingId: string
      slot: LoadoutSlotId
    }
    'power-up-core.LinkToggled': { playerId: string; itemId: string; isOn: boolean }
    /** The slot was let go and the item's live hold ended on this tick (ticket 332). */
    'power-up-core.PowerUpReleased': { playerId: string; itemId: string; slot: LoadoutSlotId }
  }
  interface RejectionReasons {
    'power-up-core.not_a_power_up_slot': true
    'power-up-core.vehicle_out_of_play': true
    'power-up-core.slot_locked': true
    'power-up-core.slot_empty': true
    'power-up-core.not_usable': true
    'power-up-core.busy': true
    'power-up-core.no_charges': true
    'power-up-core.cooling_down': true
    'power-up-core.not_still': true
    'power-up-core.invalid_charges': true
    'power-up-core.no_sibling_link': true
    'power-up-core.no_milestone': true
    'power-up-core.nothing_to_hold': true
  }
}

export interface UseSubject {
  playerId: string
  itemId: string
  slot: LoadoutSlotId
}

/** `mark` is the Mark the use acted at (#249): 0 for an item the player researched none of. */
export function powerUpUsedOf(
  subject: UseSubject,
  origin: { originTx: number; originTy: number },
  chargesLeft: number,
  mark: number,
) {
  return {
    type: 'power-up-core.PowerUpUsed' as const,
    ...subject,
    mark,
    ...origin,
    chargesLeft,
  }
}

export function powerUpBlockedOf(subject: UseSubject, block: GateBlock, chargesLeft: number) {
  return { type: 'power-up-core.PowerUpBlocked' as const, ...subject, ...block, chargesLeft }
}

export function powerUpRefusedOf(subject: UseSubject, reason: string, chargesLeft: number) {
  return { type: 'power-up-core.PowerUpRefused' as const, ...subject, reason, chargesLeft }
}

export function channelCancelledOf(subject: UseSubject, chargesLeft: number) {
  return { type: 'power-up-core.ChannelCancelled' as const, ...subject, chargesLeft }
}

export function chargesRefilledOf(playerId: string, itemId: string, chargesLeft: number) {
  return { type: 'power-up-core.ChargesRefilled' as const, playerId, itemId, chargesLeft }
}

export function linkFiredOf(
  playerId: string,
  link: { itemId: string; siblingId: string },
  slot: LoadoutSlotId,
) {
  return { type: 'power-up-core.LinkFired' as const, playerId, ...link, slot }
}

export function linkToggledOf(playerId: string, itemId: string, isOn: boolean) {
  return { type: 'power-up-core.LinkToggled' as const, playerId, itemId, isOn }
}

export function powerUpReleasedOf(subject: UseSubject) {
  return { type: 'power-up-core.PowerUpReleased' as const, ...subject }
}
