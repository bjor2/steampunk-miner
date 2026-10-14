import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { ownsItem } from '../../systems/authority/loadoutRules'
import { createBotSession } from '../../systems/bot/botSession'
import { slotHoldingItem } from '../../systems/vehicle/loadoutState'
import { COMBO_HAND_LOADOUT, SHIELD_HAND_LOADOUT } from './comboHand'
import { SHIPPED_COMBOS } from './systems/comboContent'

// The pace runs' loadouts (pin 6, GD lock on #206) must be the ones the authority takes, or the
// long runs would compare bare runs and pass for nothing.

const PARENTS = [...new Set(SHIPPED_COMBOS.flatMap((item) => item.parentItemIds))]
const COMBOS = SHIPPED_COMBOS.map((item) => item.itemId)

function sessionOnPlanet7() {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: 7 } })
  return session
}

describe('combo pace hands', () => {
  it('slots the drain, the shifter and the corer and owns every parent and combo', () => {
    const session = sessionOnPlanet7()
    const events = session.submit(
      setVehicleLoadoutCommand(COMBO_HAND_LOADOUT, [...PARENTS, ...COMBOS]),
    )
    expect(events.filter((event) => event.type === 'CommandRejected')).toEqual([])
    const { loadout } = session.vehicle()
    Object.values(COMBO_HAND_LOADOUT).forEach((itemId) =>
      expect(slotHoldingItem(loadout, itemId), itemId).not.toBeNull(),
    )
    ;[...PARENTS, ...COMBOS].forEach((itemId) =>
      expect(ownsItem(session.state(), 'p1', itemId), itemId).toBe(true),
    )
  })

  it('slots the steam shield for the alarm shield runs', () => {
    const session = sessionOnPlanet7()
    session.submit(setVehicleLoadoutCommand(SHIELD_HAND_LOADOUT, ['combo.alarm_shield']))
    expect(slotHoldingItem(session.vehicle().loadout, 'power.steam_shield')).toBe('powerup.1')
  })
})
