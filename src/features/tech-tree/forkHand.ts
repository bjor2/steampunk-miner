/**
 * The pacing bot forced onto one fork branch (GD lock on #255, build 2; ticket 267): the start
 * grants the branch outside its P16 tier (`debug.tech-tree.forceFork`) and bolts its item into the
 * first slot that takes it and is open on a new vehicle, through the debug loadout. The kernel bot
 * presses no slot, and a slice may not teach it to (one session, one slice), so `balance:forks`
 * plays the unchanged bot through a session that wraps its own, as the magnet hand does (#287):
 * before each of the bot's waits out of the dock, once a second, it presses the branch item's slot
 * whenever a dry run says the press is accepted, and leaves a toggle that is already on alone.
 * Pressing at every chance is the strict end: the most the branch can change the run. A branch
 * whose item no slot takes, or a passive no press uses, plays on the grant alone. Only specs use
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
  const slot = acceptedSlotsOf(itemId).find(isPressableOpenSlot)
  return slot === undefined ? null : { itemId, slot: slot as PressableSlot }
}

/** The forced start: the branch made active, then its item bolted into the hand's slot. */
export function forcedForkStartOf(pick: ForkPick, hand: ForkHand | null): CommandIntent[] {
  const force: CommandIntent = { type: 'debug.tech-tree.forceFork', payload: pick }
  return hand === null ? [force] : [force, loadoutOf(hand)]
}

/** `session`, pressing the hand's slot before each wait the bot makes out of the dock. */
export function withForkHand(session: BotSession, hand: ForkHand | null): BotSession {
  if (hand === null) return session
  let nextTryTick = session.tick()
  return {
    ...session,
    wait(ticks) {
      if (isTimeToTry(session, nextTryTick)) {
        pressWhenAccepted(session, hand)
        nextTryTick = session.tick() + FORK_TRY_INTERVAL_TICKS
      }
      session.wait(ticks)
    },
  }
}

function isPressableOpenSlot(slot: string): boolean {
  return PRESSABLE_SLOTS.includes(slot) && isSlotOpenAtStart(slot as PressableSlot)
}

function loadoutOf({ itemId, slot }: ForkHand): CommandIntent {
  return setVehicleLoadoutCommand({ [slot]: itemId }, [itemId])
}

function isTimeToTry(session: BotSession, nextTryTick: number): boolean {
  return isVehicleActive(session.vehicle()) && session.tick() >= nextTryTick
}

function pressWhenAccepted(session: BotSession, { itemId, slot }: ForkHand): void {
  if (isToggleEngaged(session.state(), session.playerId, itemId)) return
  const press = intentToUseSlot(slot)
  if (wouldAccept(session, press)) session.submit(press)
}
