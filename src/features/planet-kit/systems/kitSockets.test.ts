import { describe, expect, it } from 'vitest'
import { VEHICLE_HELD_ATTACH_IDS } from '../../../systems/registries/attachCoverage'
import socketsFile from '../kitSockets.json'
import { KIT_SOCKETS, kitSocketsProblems } from './kitSockets'
import { PLANET_KITS } from './planetKitRows'

// The kit items' sockets (G&V on ticket 823): render-only placement inside the locked kit.

const SOCKET_OF: Readonly<Record<string, string>> = {
  scree_plough: 'drill.hood',
  shard_tongs: 'hull.arm.left',
  vent_vane: 'hull.roof.mid',
  damp_flask: 'cab.gauge',
}

describe('kit sockets (ticket 823)', () => {
  it('reads the sockets file with no problem', () => {
    expect(kitSocketsProblems(socketsFile)).toEqual([])
  })

  it('hangs each kit item but the Cache Crate on the socket G&V named', () => {
    const sockets = Object.fromEntries(KIT_SOCKETS.map((socket) => [socket.itemId, socket.attach]))
    expect(sockets).toEqual(SOCKET_OF)
    const items = PLANET_KITS.items.map((item) => item.id).filter((id) => id !== 'cache_crate')
    expect(Object.keys(sockets).sort()).toEqual(items.sort())
  })

  it('takes no point the vehicle’s own upgrades always hold', () => {
    const held = new Set<string>(VEHICLE_HELD_ATTACH_IDS)
    expect(KIT_SOCKETS.filter((socket) => held.has(socket.attach))).toEqual([])
  })

  it('refuses a socket on a point the vehicle does not have', () => {
    const file = { sockets: [{ ...socketsFile.sockets[0], attach: 'hull.wing' }] }
    expect(kitSocketsProblems(file)).toEqual(['sockets[0].attach must be a vehicle attach id'])
  })

  it.todo('draws the Blender scree cowl on drill.hood (design + tier:fable, after ticket 823)')
  it.todo('draws the Blender gripper arm on hull.arm.left (design + tier:fable, after ticket 823)')
  it.todo('draws the Blender vent vane on hull.roof.mid (design + tier:fable, after ticket 823)')
  it.todo('draws the Blender flask rack on cab.gauge (design + tier:fable, after ticket 823)')
})
