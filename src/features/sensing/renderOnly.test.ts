import { describe, expect, it } from 'vitest'
import { GROUND, typesOf } from '../../systems/authority/scriptedSession'
import { press, sensingSession, standInPocket } from './sensingTestSession'

// #203 acceptance 1: the sensing overlays are render-only. A use acts through power-up-core
// (its charge, its cooldown, its `PowerUpUsed` line) and nothing else: the world, the enemies and
// every other section stay as they were, so digests and goldens only see what a use of any
// item would add. What it reveals is derived on each client from that one event.

const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }

function usedEchoAndBuoy() {
  const session = sensingSession()
  standInPocket(session, 2, UNDERGROUND)
  const before = session.state()
  const from = session.events().length
  session.submit(10, press('powerup.1'))
  session.advanceTo(20)
  session.submit(30, press('powerup.2'))
  session.advanceTo(40)
  return { before, after: session.state(), events: session.events().slice(from) }
}

describe('sensing render-only uses', () => {
  it('pings and drops a buoy without changing the world or the enemies', () => {
    const { before, after } = usedEchoAndBuoy()
    expect(after.world).toBe(before.world)
    expect(after.combat).toEqual(before.combat)
  })

  it('logs only power-up-core’s use lines, one for each item', () => {
    const { events } = usedEchoAndBuoy()
    expect(typesOf(events).filter((type) => !type.startsWith('power-up-core.'))).toEqual([])
    const used = events.filter((event) => event.type === 'power-up-core.PowerUpUsed')
    expect(used.map((event) => event.itemId)).toEqual([
      'power.echo_sounder',
      'consumable.signal_buoy',
    ])
  })
})
