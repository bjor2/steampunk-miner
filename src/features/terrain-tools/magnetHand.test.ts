import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { createBotSession, type BotSession } from '../../systems/bot/botSession'
import { dockCommand } from '../../systems/platform/platformCommands'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { MAGNET_HAND_LOADOUT, MAGNET_TRY_INTERVAL_TICKS, withMagnetHand } from './magnetHand'
import { buriedTile, sessionWith, standAt } from './terrainTestSession'

// The bot's hand on the terrain magnets (ticket 287): before each of the bot's waits out of the
// dock it taps the coil and presses the clamp whenever the press would be accepted. Planet 1, the
// miner at rest in a pocket underground with the family slotted by the debug loadout.

const STAND_TICK = 5
const START_TICK = 10
const STEP_TICKS = 5

/** The bot's session on the miner at rest underground, both members slotted, at `START_TICK`. */
function buriedBot(): BotSession {
  const scripted = sessionWith(MAGNET_HAND_LOADOUT)
  standAt(scripted, STAND_TICK, buriedTile(8), FACING.right)
  scripted.advanceTo(START_TICK)
  return createBotSession(scripted.state(), 'p1')
}

function waitInSteps(session: BotSession, ticks: number): void {
  for (let waited = 0; waited < ticks; waited += STEP_TICKS) session.wait(STEP_TICKS)
}

function pressedSlotsOf(commands: readonly AuthorityCommand[]): string[] {
  return commands
    .filter((command) => command.type === 'power-up-core.use_power_up')
    .map((command) => (command.payload as { slot: string }).slot)
}

describe('magnet hand', () => {
  it('taps the coil before the bot first waits out of the dock', () => {
    const hand = withMagnetHand(buriedBot())
    hand.wait(1)
    expect(pressedSlotsOf(hand.commands())).toEqual(['powerup.1'])
  })

  it('presses the clamp on its turn though the coil is ready again each second', () => {
    const hand = withMagnetHand(buriedBot())
    waitInSteps(hand, MAGNET_TRY_INTERVAL_TICKS)
    expect(pressedSlotsOf(hand.commands())).toEqual(['powerup.1', 'powerup.2'])
  })

  it('sends no press the authority refuses', () => {
    const hand = withMagnetHand(buriedBot())
    waitInSteps(hand, 4 * MAGNET_TRY_INTERVAL_TICKS)
    const refused = hand.events().filter((event) => event.type === 'CommandRejected')
    expect(refused).toEqual([])
  })

  it('presses nothing while the vehicle is docked', () => {
    const start = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
    const hand = withMagnetHand(createBotSession(start, 'p1'))
    hand.submit(setVehicleLoadoutCommand(MAGNET_HAND_LOADOUT))
    hand.submit(dockCommand('sell'))
    expect(hand.vehicle().mode).toBe('docked')
    waitInSteps(hand, 2 * MAGNET_TRY_INTERVAL_TICKS)
    expect(pressedSlotsOf(hand.commands())).toEqual([])
  })
})
