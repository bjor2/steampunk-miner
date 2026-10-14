/**
 * The pacing bot's hand on the combos' partner items (pin 6 of the GD lock on #206, ticket 206): the
 * mineral drain in `powerup.1`, the ore-shifter in `powerup.2` and the sampling corer in the drill
 * collar, pressed by a session that wraps the bot's own. The kernel bot presses no slot, and a slice
 * may not teach it to (one session, one slice), so the pace runs play the unchanged bot through this
 * session, as `balance:magnets` does (ticket 287): before each of the bot's waits out of the dock it
 * presses one slot whenever a dry run says the press is accepted, the slots taking turns so each is
 * tried once a second. Pressing at every chance is the strict end of the gate: the most a combo can
 * add. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { lungeWarningsOf } from '../../systems/authority/sensingQueries'
import { wouldAccept } from '../../systems/bot/botDryRun'
import type { BotSession } from '../../systems/bot/botSession'
import { ECONOMY } from '../../systems/economy/economy'
import { isVehicleActive } from '../../systems/vehicle/vehicleState'
import { intentToUseSlot, type PressableSlot } from '../power-up-core'

/** Where the hand finds each partner item: the debug loadout slots them. */
export const COMBO_HAND_LOADOUT: Readonly<Record<string, string>> = {
  'powerup.1': 'power.mineral_drain',
  'powerup.2': 'power.ore_shifter',
  'drill.collar': 'gear.sampling_corer',
}

const HAND_SLOTS = Object.keys(COMBO_HAND_LOADOUT) as PressableSlot[]

/** How often each slot is tried: a refused dry run costs a whole authority step. */
const TRY_INTERVAL_TICKS = TICKS_PER_SECOND

/** Whose turn it is and when: the slots take turns, so a press that costs nothing starves none. */
interface HandTurn {
  slotIndex: number
  tick: number
}

/** `session`, pressing the partner items before each wait the bot makes out of the dock. */
export function withComboHand(session: BotSession): BotSession {
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

/** Where the shield hand finds the steam shield. */
export const SHIELD_HAND_LOADOUT: Readonly<Record<string, string>> = {
  'powerup.1': 'power.steam_shield',
}

/**
 * `session`, pressing the steam shield by hand whenever an enemy winds up a lunge on the miner
 * inside the cap: the manual use the alarm shield's runs are judged against (GD lock on #206).
 */
export function withShieldHand(session: BotSession): BotSession {
  return {
    ...session,
    wait(ticks) {
      pressShieldOnWarning(session)
      session.wait(ticks)
    },
  }
}

function pressShieldOnWarning(session: BotSession): void {
  const reach = ECONOMY.itemHookCaps.reachCellsMax
  const isWarned = lungeWarningsOf(session.state(), session.playerId, reach).length > 0
  if (isWarned) pressWhenAccepted(session, 'powerup.1')
}
