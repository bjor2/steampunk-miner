/**
 * The pacing bot's hand on the terrain magnets (GD lock on #246, build 6; ticket 287): the coil in
 * `powerup.1` and the lode clamp in `powerup.2`, pressed by a session that wraps the bot's own.
 * The kernel bot presses no slot, and a slice may not teach it to (one session, one slice), so
 * `balance:magnets` plays the unchanged bot through this session: before each of the bot's waits
 * out of the dock, it taps the coil and presses the clamp whenever a dry run says the press is
 * accepted, the two slots taking turns so each is tried once a second. The clamp is never let go: its field runs to
 * its Mark's duration, or ends at the dock, drawing the drill's rate all the while. Pressing at
 * every chance is the strict end of the pace assert: the most help the family can give, at the
 * most energy it can cost. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { BotSession } from '../../systems/bot/botSession'
import { wouldAccept } from '../../systems/bot/botDryRun'
import { isVehicleActive } from '../../systems/vehicle/vehicleState'
import { intentToUseSlot, type PressableSlot } from '../power-up-core'
import { LODE_CLAMP_ID } from './systems/lodeClamp'
import { REPULSOR_COIL_ID } from './systems/repulsorCoil'

/** Where the hand finds each member: the debug loadout that grants the family slots both. */
export const MAGNET_HAND_LOADOUT: Readonly<Record<string, string>> = {
  'powerup.1': REPULSOR_COIL_ID,
  'powerup.2': LODE_CLAMP_ID,
}

const HAND_SLOTS: readonly PressableSlot[] = ['powerup.1', 'powerup.2']

/** How often each slot is tried: a refused dry run costs a whole authority step. */
export const MAGNET_TRY_INTERVAL_TICKS = TICKS_PER_SECOND

/** Whose turn it is and when: the slots take turns, so a press that costs nothing starves none. */
interface HandTurn {
  slotIndex: number
  tick: number
}

/** `session`, pressing the magnets in its slots before each wait the bot makes out of the dock. */
export function withMagnetHand(session: BotSession): BotSession {
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

/** The next slot's turn, so each slot is tried once every `MAGNET_TRY_INTERVAL_TICKS`. */
function passTurn(session: BotSession, turn: HandTurn): void {
  turn.slotIndex = (turn.slotIndex + 1) % HAND_SLOTS.length
  turn.tick = session.tick() + MAGNET_TRY_INTERVAL_TICKS / HAND_SLOTS.length
}
