/**
 * The pacing bot forced onto one fork branch (GD lock on #255, build 2; ticket 267): the start
 * grants the branch outside its P16 tier (`debug.tech-tree.forceFork`) and bolts its item into the
 * first slot that takes it and is open on a new vehicle, through the debug loadout. The kernel bot
 * presses no slot, and a slice may not teach it to (one session, one slice), so `balance:forks`
 * plays the unchanged bot through a session that wraps its own, as the magnet hand does (#287):
 * before each of the bot's waits out of the dock, once a second, it presses the branch item's slot
 * whenever a dry run says the press is accepted, and leaves a toggle that is already on alone.
 * Pressing at every chance is the strict end: the most the branch can change the run. A branch
 * whose item no slot takes, or a passive no press uses, plays on the grant alone.
 *
 * Forced onto a whole lane (ticket 266, the Aetheric pace re-run), the lane's items are owned and
 * each bolted into the next open slot that takes it, earliest node first, and the hand presses
 * one slot a try, in turn, so an item refused at every try never starves the next. Only specs use
 * it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { wouldAccept } from '../../systems/bot/botDryRun'
import type { BotSession } from '../../systems/bot/botSession'
import { acceptedSlotsOf, isSlotOpenAtStart } from '../../systems/registries/vehicleLoadout'
import { isVehicleActive } from '../../systems/vehicle/vehicleState'
import {
  DRILL_GEAR_SOCKETS,
  intentToUseSlot,
  isToggleEngaged,
  POWER_UP_SLOTS,
  type PressableSlot,
} from '../power-up-core'
import type { ForkPick } from './systems/forkCommands'

/** The branch's item and the slot the hand presses it in. */
export interface ForkHand {
  itemId: string
  slot: PressableSlot
}

/** How often the hand tries: a refused dry run costs a whole authority step. */
export const FORK_TRY_INTERVAL_TICKS = TICKS_PER_SECOND

const PRESSABLE_SLOTS: readonly string[] = [...POWER_UP_SLOTS, ...DRILL_GEAR_SOCKETS]

/** The item in the first slot that takes it, is open at the start and is pressed; null for none. */
export function forkHandOf(itemId: string): ForkHand | null {
  return forkHandsOf([itemId])[0] ?? null
}

/**
 * Each item in the first slot that takes it, is open at the start and no earlier item holds; an
 * item left with no such slot gets no hand.
 */
export function forkHandsOf(itemIds: readonly string[]): ForkHand[] {
  const hands: ForkHand[] = []
  for (const itemId of itemIds) {
    const slot = acceptedSlotsOf(itemId).find((each) => isFreePressableSlot(each, hands))
    if (slot !== undefined) hands.push({ itemId, slot: slot as PressableSlot })
  }
  return hands
}

/** The forced start: the branch made active, then the hands' items bolted in, `owned` owned. */
export function forcedForkStartOf(
  pick: ForkPick,
  hands: readonly ForkHand[],
  owned: readonly string[] = hands.map((hand) => hand.itemId),
): CommandIntent[] {
  const force: CommandIntent = { type: 'debug.tech-tree.forceFork', payload: pick }
  return owned.length === 0 ? [force] : [force, loadoutOf(hands, owned)]
}

/** `session`, pressing the hand's slot before each wait the bot makes out of the dock. */
export function withForkHand(session: BotSession, hand: ForkHand | null): BotSession {
  return withForkHands(session, hand === null ? [] : [hand])
}

/** `session`, pressing one hand's slot a try, in turn, before each wait out of the dock. */
export function withForkHands(session: BotSession, hands: readonly ForkHand[]): BotSession {
  if (hands.length === 0) return session
  let nextTryTick = session.tick()
  let turn = 0
  return {
    ...session,
    wait(ticks) {
      if (isTimeToTry(session, nextTryTick)) {
        pressWhenAccepted(session, hands[turn % hands.length])
        turn += 1
        nextTryTick = session.tick() + FORK_TRY_INTERVAL_TICKS
      }
      session.wait(ticks)
    },
  }
}

function isFreePressableSlot(slot: string, hands: readonly ForkHand[]): boolean {
  return isPressableOpenSlot(slot) && !hands.some((hand) => hand.slot === slot)
}

function isPressableOpenSlot(slot: string): boolean {
  return PRESSABLE_SLOTS.includes(slot) && isSlotOpenAtStart(slot as PressableSlot)
}

function loadoutOf(hands: readonly ForkHand[], owned: readonly string[]): CommandIntent {
  const slots = Object.fromEntries(hands.map((hand) => [hand.slot, hand.itemId]))
  return setVehicleLoadoutCommand(slots, owned)
}

function isTimeToTry(session: BotSession, nextTryTick: number): boolean {
  return isVehicleActive(session.vehicle()) && session.tick() >= nextTryTick
}

function pressWhenAccepted(session: BotSession, { itemId, slot }: ForkHand): void {
  if (isToggleEngaged(session.state(), session.playerId, itemId)) return
  const press = intentToUseSlot(slot)
  if (wouldAccept(session, press)) session.submit(press)
}
