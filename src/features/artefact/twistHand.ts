/**
 * The pacing bot's hand on the twists' base items (pin 6 of the GD lock on #206, ticket 329): the
 * echo sounder, the grapple winch and the ore-shifter in the first three power-up slots (the third
 * cradle owned to open the third), pressed by a session that wraps the bot's own. The kernel bot
 * presses no slot, and a slice may not teach it to (one session, one slice), so the pace runs play
 * the unchanged bot through this session, as the combos' hand does (ticket 206): before each of the
 * bot's waits out of the dock it presses one slot whenever a dry run says the press is accepted,
 * the slots taking turns so each is tried once a second. Pressing at every chance is the strict end
 * of the gate: the most a twist can add. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { wouldAccept } from '../../systems/bot/botDryRun'
import type { BotSession } from '../../systems/bot/botSession'
import { isVehicleActive } from '../../systems/vehicle/vehicleState'
import { intentToUseSlot, type PressableSlot } from '../power-up-core'
import { TWISTS } from './systems/twistCatalogue'

/** The third power-up slot's cradle (#162 2.2): owned beside the base items, so slot 3 is open. */
export const THIRD_CRADLE = 'slot.powerup_3'

/** Where the hand finds each base item: the debug loadout slots them. */
export const TWIST_HAND_LOADOUT: Readonly<Record<string, string>> = Object.fromEntries(
  TWISTS.map((twist, index) => [`powerup.${index + 1}`, twist.baseItemId]),
)

/** What the hand's runs own: every base item and the cradle that opens the third slot. */
export const TWIST_HAND_OWNED: readonly string[] = [
  ...TWISTS.map((twist) => twist.baseItemId),
  THIRD_CRADLE,
]

const HAND_SLOTS = Object.keys(TWIST_HAND_LOADOUT) as PressableSlot[]

/** How often each slot is tried: a refused dry run costs a whole authority step. */
const TRY_INTERVAL_TICKS = TICKS_PER_SECOND

/** Whose turn it is and when: the slots take turns, so a press that costs nothing starves none. */
interface HandTurn {
  slotIndex: number
  tick: number
}

/** `session`, pressing the base items before each wait the bot makes out of the dock. */
export function withTwistHand(session: BotSession): BotSession {
  const turn: HandTurn = { slotIndex: 0, tick: session.tick() }
  return {
    ...session,
    wait(ticks) {
      pressWhenItsTurn(session, turn)
      session.wait(ticks)
    },
  }
}

function pressWhenItsTurn(session: BotSession, turn: HandTurn): void {
  if (!isVehicleActive(session.vehicle()) || session.tick() < turn.tick) return
  pressWhenAccepted(session, HAND_SLOTS[turn.slotIndex])
  passTurn(session, turn)
}

function pressWhenAccepted(session: BotSession, slot: PressableSlot): void {
  const press = intentToUseSlot(slot)
  if (wouldAccept(session, press)) session.submit(press)
}

function passTurn(session: BotSession, turn: HandTurn): void {
  turn.slotIndex = (turn.slotIndex + 1) % HAND_SLOTS.length
  turn.tick = session.tick() + TRY_INTERVAL_TICKS / HAND_SLOTS.length
}
