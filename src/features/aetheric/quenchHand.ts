/**
 * The pacing bot's hand on quench cutters (ticket 373; the GD ruling's gates on #373): the side
 * cutters in `drill.flank` and the aether condenser in `powerup.1`, pressed by a session that wraps
 * the bot's own, on the shape of terrain-tools' magnet hand (ticket 287). The kernel bot presses no
 * slot, and a slice may not teach it to (one session, one slice), so the pace runs play the
 * unchanged bot through this session: before each of the bot's waits out of the dock, it engages
 * the cutters if they are off, and otherwise runs the condenser whenever a dry run says the press
 * is accepted, once a second at most. Running it at every chance is the strict end of the gates:
 * the most charge the combo can give back. Only specs use it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { BotSession } from '../../systems/bot/botSession'
import { wouldAccept } from '../../systems/bot/botDryRun'
import { isVehicleActive } from '../../systems/vehicle/vehicleState'
import { intentToUseSlot, isToggleEngaged } from '../power-up-core'
import { QUENCH_CUTTERS_ID } from './systems/aethericCombos'
import { CONDENSER_ID } from './systems/condenserItem'

const SIDE_CUTTERS = 'gear.side_cutters'

/** The debug loadout that grants the hand both parents. */
export const QUENCH_HAND_LOADOUT: Readonly<Record<string, string>> = {
  'drill.flank': SIDE_CUTTERS,
  'powerup.1': CONDENSER_ID,
}

/** The hand's arrival commands, with the combo owned or not. */
export function quenchHandSetup(withCombo: boolean): CommandIntent[] {
  return [setVehicleLoadoutCommand(QUENCH_HAND_LOADOUT, withCombo ? [QUENCH_CUTTERS_ID] : [])]
}

/** A refused dry run costs a whole authority step, so the condenser is tried once a second. */
const TRY_INTERVAL_TICKS = TICKS_PER_SECOND

/** `session`, keeping the cutters engaged and the condenser running before each wait. */
export function withQuenchHand(session: BotSession): BotSession {
  const turn = { tick: session.tick() }
  return {
    ...session,
    wait(ticks) {
      pressWhenDue(session, turn)
      session.wait(ticks)
    },
  }
}

function pressWhenDue(session: BotSession, turn: { tick: number }): void {
  if (!isVehicleActive(session.vehicle()) || session.tick() < turn.tick) return
  pressWhenAccepted(session, areCuttersEngaged(session) ? 'powerup.1' : 'drill.flank')
  turn.tick = session.tick() + TRY_INTERVAL_TICKS
}

function areCuttersEngaged(session: BotSession): boolean {
  return isToggleEngaged(session.state(), session.playerId, SIDE_CUTTERS)
}

function pressWhenAccepted(session: BotSession, slot: 'drill.flank' | 'powerup.1'): void {
  const press = intentToUseSlot(slot)
  if (wouldAccept(session, press)) session.submit(press)
}
