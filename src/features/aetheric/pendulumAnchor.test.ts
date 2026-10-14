import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { CORRIDOR_MIDDLE, prepareCorridor } from '../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { chargesLeftOf, intentToUseSlot, isToggleEngaged } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { PENDULUM_ANCHOR_ID } from './systems/aethericCombos'
import { GOVERNOR_ID } from './systems/governorItem'
import { pocketOf } from './systems/pocketSection'

// Pendulum anchor (ticket 373, aetheric × mobility): the grav anchor switching on while it pins the
// vehicle in open air presses the governor on its own, which opens its pocket round the pinned
// vehicle at its own range, charging its energy, heat and cooldown. In the corridor of
// `combatFixtures.ts`, whose roof the anchor clings to: with the floor under the vehicle carved
// away it hangs in open air; with the floor left it stands on the ground.

const GRAV_ANCHOR = 'power.grav_anchor'
const GOVERNOR = AETHERIC_ECONOMY.chronometricGovernor
const SLOTS = { 'powerup.1': GOVERNOR_ID, 'powerup.2': GRAV_ANCHOR }
const SETTLE_TICKS = 10

interface AnchorPin {
  session: ScriptedSession
  pinTick: number
}

function anchorPin({ owned = [PENDULUM_ANCHOR_ID], isFloorCarved = true } = {}): AnchorPin {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand(SLOTS, owned))
  if (isFloorCarved) session.submit(start, carveFloorUnderVehicle())
  const pinTick = start + 1
  session.submit(pinTick, intentToUseSlot('powerup.2'))
  session.advanceTo(pinTick + SETTLE_TICKS)
  return { session, pinTick }
}

/** The tile under the corridor's middle, carved to open air. */
function carveFloorUnderVehicle() {
  const half = MM_PER_METRE / 2
  return carveCircleCommand({
    x: CORRIDOR_MIDDLE.tx * MM_PER_METRE + half,
    y: (CORRIDOR_MIDDLE.ty - 1) * MM_PER_METRE + half,
    radius: half,
    amount: SOLID_DENSITY,
  })
}

const ofType = (session: ScriptedSession, type: string): DomainEvent[] =>
  session.events().filter((event) => event.type === type)

describe('pendulum anchor', () => {
  it('opens the governor pocket round the vehicle pinned in open air', () => {
    const { session, pinTick } = anchorPin()
    expect(isToggleEngaged(session.state(), 'p1', GRAV_ANCHOR)).toBe(true)
    const [swung] = ofType(session, 'aetheric.PendulumSwung')
    expect(swung).toMatchObject({
      playerId: 'p1',
      itemId: PENDULUM_ANCHOR_ID,
      tx: CORRIDOR_MIDDLE.tx,
      ty: CORRIDOR_MIDDLE.ty,
    })
    const [opened] = ofType(session, 'aetheric.PocketOpened')
    expect(opened.tick).toBe(swung.tick + GOVERNOR.windupTicks)
    expect(pocketOf(session.state(), 'p1').pocket).toMatchObject({
      tx: CORRIDOR_MIDDLE.tx,
      ty: CORRIDOR_MIDDLE.ty,
      reachMm: GOVERNOR.rangeTiles * MM_PER_METRE,
    })
    expect(swung.tick).toBeGreaterThanOrEqual(pinTick)
  })

  it("charges the governor's own charge through the press path, beside pendulum_swung", () => {
    const { session } = anchorPin()
    expect(ofType(session, 'power-up-core.PowerUpAutoFired')).toMatchObject([
      { itemId: GOVERNOR_ID },
    ])
    const used = ofType(session, 'power-up-core.PowerUpUsed')
    expect(used.map((event) => 'itemId' in event && event.itemId)).toEqual([
      GRAV_ANCHOR,
      GOVERNOR_ID,
    ])
    expect(chargesLeftOf(session.state(), 'p1', GOVERNOR_ID)).toBe(GOVERNOR.charges - 1)
  })

  it('opens nothing while the vehicle stands on the ground', () => {
    const { session } = anchorPin({ isFloorCarved: false })
    expect(ofType(session, 'aetheric.PendulumSwung')).toEqual([])
    expect(pocketOf(session.state(), 'p1').pocket).toBeNull()
  })

  it('opens nothing without the combo', () => {
    const { session } = anchorPin({ owned: [] })
    expect(ofType(session, 'aetheric.PendulumSwung')).toEqual([])
    expect(ofType(session, 'power-up-core.PowerUpAutoFired')).toEqual([])
  })

  it('takes no press inside the gap: a pocket opened by hand is left as it is', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, setVehicleLoadoutCommand(SLOTS, [PENDULUM_ANCHOR_ID]))
    session.submit(start, carveFloorUnderVehicle())
    session.submit(start + 1, intentToUseSlot('powerup.1'))
    session.submit(start + 1 + GOVERNOR.windupTicks + 1, intentToUseSlot('powerup.2'))
    session.advanceTo(start + 1 + GOVERNOR.windupTicks + SETTLE_TICKS)
    expect(ofType(session, 'aetheric.PendulumSwung')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', GOVERNOR_ID)).toBe(GOVERNOR.charges - 1)
  })
})
