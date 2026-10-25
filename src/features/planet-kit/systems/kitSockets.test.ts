import { describe, expect, it } from 'vitest'
import { VEHICLE_HELD_ATTACH_IDS } from '../../../systems/registries/attachCoverage'
import socketsFile from '../kitSockets.json'
import {
  KIT_SOCKETS,
  kitSocketArtAssets,
  kitSocketOf,
  kitSocketPoseOf,
  kitSocketsProblems,
} from './kitSockets'
import { PLANET_KITS } from './planetKitRows'

// The kit items' sockets (G&V on ticket 823): render-only placement inside the locked kit, each
// with its Blender asset and parts since ticket 825.

const SOCKET_OF: Readonly<Record<string, string>> = {
  scree_plough: 'drill.hood',
  shard_tongs: 'hull.arm.left',
  vent_vane: 'hull.roof.mid',
  damp_flask: 'cab.gauge',
}

const firstSocket = socketsFile.sockets[0]

describe('kit sockets (ticket 823)', () => {
  it('reads the sockets file with no problem', () => {
    expect(kitSocketsProblems(socketsFile)).toEqual([])
  })

  it('hangs each kit item but the Cache Crate on the socket G&V named', () => {
    const sockets = Object.fromEntries(KIT_SOCKETS.map((socket) => [socket.itemId, socket.attach]))
    expect(sockets).toEqual(SOCKET_OF)
    const items = PLANET_KITS.items.map((item) => item.id).filter((id) => id !== 'cache_crate')
    expect(Object.keys(sockets).sort()).toEqual(items.sort())
    expect(kitSocketOf(KIT_SOCKETS, 'cache_crate')).toBeNull()
  })

  it('takes no point the vehicle’s own upgrades always hold', () => {
    const held = new Set<string>(VEHICLE_HELD_ATTACH_IDS)
    expect(KIT_SOCKETS.filter((socket) => held.has(socket.attach))).toEqual([])
  })

  it('refuses a socket on a point the vehicle does not have', () => {
    const file = { sockets: [{ ...firstSocket, attach: 'hull.wing' }] }
    expect(kitSocketsProblems(file)).toEqual(['sockets[0].attach must be a vehicle attach id'])
  })
})

describe('kit socket art (ticket 825)', () => {
  it('names each socket’s asset by the kernel’s slot-item rule, vehicle-item-<id>', () => {
    expect(KIT_SOCKETS.map((socket) => socket.assetId)).toEqual([
      'vehicle-item-scree-plough',
      'vehicle-item-damp-flask',
      'vehicle-item-shard-tongs',
      'vehicle-item-vent-vane',
    ])
  })

  it('refuses an asset id that drifts from the item id', () => {
    const file = { sockets: [{ ...firstSocket, assetId: 'vehicle-item-plough' }] }
    expect(kitSocketsProblems(file)).toEqual([
      'sockets[0].assetId must be "vehicle-item-scree-plough"',
    ])
  })

  it('refuses a part with one pose but not the other', () => {
    const part = { id: 'plough-blade', z: 10, resting: { turn: 0, shift: [0, 0] } }
    const file = { sockets: [{ ...firstSocket, parts: [part] }] }
    expect(kitSocketsProblems(file)).toEqual([
      'sockets[0].parts[0] needs both poses, resting and acting, or neither',
    ])
  })

  it('refuses a part field it does not know and a flask count below one', () => {
    const file = {
      sockets: [
        { ...firstSocket, parts: [{ id: 'plough-cowl', z: 9, colour: '#fff', shownFromHeld: 0 }] },
      ],
    }
    expect(kitSocketsProblems(file)).toEqual([
      'sockets[0].parts[0].colour is not a part field',
      'sockets[0].parts[0].shownFromHeld must be a held count from 1',
    ])
  })

  it('registers one vehicle asset per socket with its parts', () => {
    expect(kitSocketArtAssets(KIT_SOCKETS)).toEqual([
      {
        id: 'vehicle-item-scree-plough',
        category: 'vehicle',
        parts: ['plough-cowl', 'plough-blade'],
      },
      {
        id: 'vehicle-item-damp-flask',
        category: 'vehicle',
        parts: ['flask-rack', 'flask-1', 'flask-2', 'flask-3'],
      },
      {
        id: 'vehicle-item-shard-tongs',
        category: 'vehicle',
        parts: ['tongs-arm', 'tongs-shard', 'tongs-jaw'],
      },
      {
        id: 'vehicle-item-vent-vane',
        category: 'vehicle',
        parts: ['vane-hinge', 'vane-leaf', 'vane-leaf-2'],
      },
    ])
  })

  it('shows a flask per held flask up to the stack limit of 3, and the shard only while acting', () => {
    const flasks = kitSocketOf(KIT_SOCKETS, 'damp_flask')!.parts.filter(
      (part) => part.shownFromHeld,
    )
    expect(flasks.map((part) => part.shownFromHeld)).toEqual([1, 2, 3])
    expect(Math.max(...flasks.map((part) => part.shownFromHeld!))).toBe(
      PLANET_KITS.items.find((item) => item.id === 'damp_flask')!.stackLimit,
    )
    const shard = kitSocketOf(KIT_SOCKETS, 'shard_tongs')!.parts.find(
      (part) => part.id === 'tongs-shard',
    )
    expect(shard?.shownWhileActing).toBe(true)
  })

  it('poses a moving part acting or resting and never moves a standing one', () => {
    const [cowl, blade] = kitSocketOf(KIT_SOCKETS, 'scree_plough')!.parts
    expect(kitSocketPoseOf(cowl, true)).toEqual({ turn: 0, shift: [0, 0] })
    expect(kitSocketPoseOf(blade, false)).toEqual({ turn: 0, shift: [0, 0] })
    expect(kitSocketPoseOf(blade, true).turn).toBeLessThan(0)
  })
})
