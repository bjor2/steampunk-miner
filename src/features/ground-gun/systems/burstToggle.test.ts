import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { OVERPRESSURE_BURST_ITEM_ID } from './autoGunsLane'
import { burstToggleIntentOf, burstToggleOf } from './burstToggle'

const PLAYER = 'p1'
const mountGuns: CommandIntent = { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

function rigWith(commands: readonly CommandIntent[]) {
  const session = createScriptedSession()
  for (const intent of commands) session.submit(0, intent)
  session.advanceTo(1)
  return session
}

describe("ground-gun: Overpressure's HUD toggle (ticket 388 sending K-burst's turret.burst)", () => {
  it('offers no toggle before Overpressure is on mounted guns', () => {
    expect(burstToggleOf(rigWith([own([OVERPRESSURE_BURST_ITEM_ID])]).state(), PLAYER)).toBeNull()
    expect(burstToggleOf(rigWith([mountGuns]).state(), PLAYER)).toBeNull()
  })

  it('shows the switch off and idle once Overpressure rides the guns, and a press asks for on', () => {
    const toggle = burstToggleOf(
      rigWith([mountGuns, own([OVERPRESSURE_BURST_ITEM_ID])]).state(),
      PLAYER,
    )

    expect(toggle).toEqual({ isOn: false, phase: 'none' })
    expect(toggle && burstToggleIntentOf(toggle)).toEqual({
      type: 'turret.burst',
      payload: { on: true },
    })
  })

  it('reads the server-latched burst after the press, and the next press asks for off', () => {
    const session = rigWith([mountGuns, own([OVERPRESSURE_BURST_ITEM_ID])])
    session.submit(2, { type: 'turret.burst', payload: { on: true } })
    session.advanceTo(3)
    const toggle = burstToggleOf(session.state(), PLAYER)

    expect(toggle).toEqual({ isOn: true, phase: 'burst' })
    expect(toggle && burstToggleIntentOf(toggle)).toEqual({
      type: 'turret.burst',
      payload: { on: false },
    })
  })
})
