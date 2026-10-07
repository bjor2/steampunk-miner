/**
 * The commands, domain events and rejection reasons `power-up-core` adds (feature-slices.md 3.15),
 * by augmentation, never by editing the kernel's lists; and the event bodies its rules build.
 *
 * Every event names its player: the wind-up and channel resolve on the authority clock, whose
 * events carry no command stamp.
 */
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import type { GateBlock } from './powerUpKind'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** #162 section 2.3: press the power-up in a slot (`use_slot_1`-`5`). */
    'power-up-core.use_power_up': { slot: string }
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
    'power-up-core.ChannelCancelled': {
      playerId: string
      itemId: string
      slot: LoadoutSlotId
      chargesLeft: number
    }
    'power-up-core.ChargesRefilled': { playerId: string; itemId: string; chargesLeft: number }
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
  }
}

/**
 * Every use logs Mark 0 until the tech tree's Marks land (#161, #165); the field is in the line
 * from the start so the log schema does not change when they do.
 */
export const MARK_BEFORE_THE_TREE = 0

export interface UseSubject {
  playerId: string
  itemId: string
  slot: LoadoutSlotId
}

export function powerUpUsedOf(
  subject: UseSubject,
  origin: { originTx: number; originTy: number },
  chargesLeft: number,
) {
  return {
    type: 'power-up-core.PowerUpUsed' as const,
    ...subject,
    mark: MARK_BEFORE_THE_TREE,
    ...origin,
    chargesLeft,
  }
}

export function powerUpBlockedOf(subject: UseSubject, block: GateBlock, chargesLeft: number) {
  return { type: 'power-up-core.PowerUpBlocked' as const, ...subject, ...block, chargesLeft }
}

export function channelCancelledOf(subject: UseSubject, chargesLeft: number) {
  return { type: 'power-up-core.ChannelCancelled' as const, ...subject, chargesLeft }
}

export function chargesRefilledOf(playerId: string, itemId: string, chargesLeft: number) {
  return { type: 'power-up-core.ChargesRefilled' as const, playerId, itemId, chargesLeft }
}
