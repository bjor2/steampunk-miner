import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf } from '../../../../systems/art/artCatalogue'
import { attachPointOf } from '../../../../systems/art/partsSidecar'
import {
  drillTipFrontOf,
  isBoxInside,
  KIT_SOCKET_ALL_SHOWN,
  KIT_SOCKET_AT_REST,
  kitSocketQuadBoxOf,
  kitSocketQuadsOf,
  rigBoundsOf,
  type KitSocketShow,
} from './kitSocketLook'
import { KIT_SOCKETS, kitSocketOf } from '../kitSockets'

// What the kit sockets draw (ticket 825): the Blender parts at G&V's points, posed, the flasks by
// the held count and the shard while acting, and the G&V guard: no part leaves the rig's bounds at
// any pose or passes the drawn drill tip (#789).

const VEHICLE = exportedSidecarOf(SHIPPED_ART, 'vehicle')!
const RIG_TIERS = [1, 3]
/** A hair for the export's 4-decimal metres and a turned quad's corners. */
const TOLERANCE_M = 0.005

const socket = (itemId: string) => kitSocketOf(KIT_SOCKETS, itemId)!

function partIdsShown(itemId: string, show: KitSocketShow): string[] {
  return kitSocketQuadsOf(SHIPPED_ART, socket(itemId), show).map((quad) => quad.partId)
}

describe('kit socket look', () => {
  it('hangs the plough’s cowl with its pivot on kit.blade, where the vehicle sidecar puts the point', () => {
    const point = attachPointOf(VEHICLE, 'kit.blade')!
    const cowl = kitSocketQuadsOf(SHIPPED_ART, socket('scree_plough'), KIT_SOCKET_AT_REST).find(
      (quad) => quad.partId === 'plough-cowl',
    )!
    expect(cowl.pivot[0]).toBeCloseTo(point.atM[0], 4)
    expect(cowl.pivot[1]).toBeCloseTo(point.atM[1], 4)
    expect(cowl.turn).toBe(0)
  })

  it('shows one flask per held flask on the rack, up to three', () => {
    expect(partIdsShown('damp_flask', { heldFlasks: 0, isActing: false })).toEqual(['flask-rack'])
    expect(partIdsShown('damp_flask', { heldFlasks: 2, isActing: false }).sort()).toEqual([
      'flask-1',
      'flask-2',
      'flask-rack',
    ])
    expect(partIdsShown('damp_flask', KIT_SOCKET_ALL_SHOWN)).toHaveLength(4)
  })

  it('shows the shard only while the tongs act, and closes the jaw then', () => {
    expect(partIdsShown('shard_tongs', KIT_SOCKET_AT_REST).sort()).toEqual([
      'tongs-arm',
      'tongs-jaw',
    ])
    const acting = kitSocketQuadsOf(SHIPPED_ART, socket('shard_tongs'), KIT_SOCKET_ALL_SHOWN)
    expect(acting.map((quad) => quad.partId).sort()).toEqual([
      'tongs-arm',
      'tongs-jaw',
      'tongs-shard',
    ])
    const jaw = acting.find((quad) => quad.partId === 'tongs-jaw')!
    expect(jaw.turn).toBe(
      socket('shard_tongs').parts.find((part) => part.id === 'tongs-jaw')!.acting!.turn,
    )
  })

  it('fans the vane’s leaves open while acting and folds them shut at rest', () => {
    const rest = kitSocketQuadsOf(SHIPPED_ART, socket('vent_vane'), KIT_SOCKET_AT_REST)
    expect(rest.every((quad) => quad.turn === 0)).toBe(true)
    const open = kitSocketQuadsOf(SHIPPED_ART, socket('vent_vane'), KIT_SOCKET_ALL_SHOWN)
    const turns = open
      .filter((quad) => quad.partId.startsWith('vane-leaf'))
      .map((quad) => quad.turn)
    expect(turns.length).toBe(2)
    expect(new Set(turns).size).toBe(2)
    expect(turns.every((turn) => turn < 0)).toBe(true)
  })

  it('lowers the plough’s cowl and blade while it acts (ticket 883)', () => {
    const lowOf = (show: KitSocketShow, partId: string) =>
      kitSocketQuadsOf(SHIPPED_ART, socket('scree_plough'), show).find(
        (quad) => quad.partId === partId,
      )!.centre[1]
    for (const partId of ['plough-cowl', 'plough-blade']) {
      expect(lowOf(KIT_SOCKET_ALL_SHOWN, partId)).toBeLessThan(lowOf(KIT_SOCKET_AT_REST, partId))
    }
  })

  it('stands the first flask vented, tilted and lifted, while one is open (ticket 883)', () => {
    const flaskOf = (isActing: boolean) =>
      kitSocketQuadsOf(SHIPPED_ART, socket('damp_flask'), { heldFlasks: 1, isActing }).find(
        (quad) => quad.partId === 'flask-1',
      )!
    expect(flaskOf(false).turn).toBe(0)
    expect(flaskOf(true).turn).not.toBe(0)
    expect(flaskOf(true).centre[1]).toBeGreaterThan(flaskOf(false).centre[1])
  })

  it('turns a quad’s box about its pivot', () => {
    const box = kitSocketQuadBoxOf({
      partId: 'probe',
      centre: [1, 0],
      pivot: [0, 0],
      size: [2, 0],
      z: 0,
      colour: '#000000',
      uv: null,
      turn: Math.PI / 2,
    })
    expect(box.map((side) => Math.round(side * 1000) / 1000)).toEqual([0, 0, 0, 2])
  })

  it('bounds the rig wider and taller at tier 3 than at tier 1, the drill tip further ahead', () => {
    const tier1 = rigBoundsOf(VEHICLE, 1)
    const tier3 = rigBoundsOf(VEHICLE, 3)
    expect(isBoxInside(tier1, tier3, 0)).toBe(true)
    expect(drillTipFrontOf(VEHICLE, 3)).toBeGreaterThan(drillTipFrontOf(VEHICLE, 1))
    expect(drillTipFrontOf(VEHICLE, 1)).toBeCloseTo(tier1[2], 4)
  })

  describe.each(KIT_SOCKETS.map((socket) => [socket.itemId] as const))(
    '%s (the G&V guard, #789)',
    (itemId) => {
      it.each(RIG_TIERS)(
        'keeps every part inside the rig’s bounds at tier %i, at rest and acting',
        (tier) => {
          const bounds = rigBoundsOf(VEHICLE, tier)
          for (const show of [KIT_SOCKET_AT_REST, KIT_SOCKET_ALL_SHOWN]) {
            for (const quad of kitSocketQuadsOf(SHIPPED_ART, socket(itemId), show)) {
              const box = kitSocketQuadBoxOf(quad)
              expect(
                isBoxInside(box, bounds, TOLERANCE_M),
                `${quad.partId} ${String(box)} in ${String(bounds)}`,
              ).toBe(true)
            }
          }
        },
      )

      it.each(RIG_TIERS)('stays behind the drawn drill tip at tier %i', (tier) => {
        const tip = drillTipFrontOf(VEHICLE, tier)
        for (const show of [KIT_SOCKET_AT_REST, KIT_SOCKET_ALL_SHOWN]) {
          for (const quad of kitSocketQuadsOf(SHIPPED_ART, socket(itemId), show)) {
            expect(kitSocketQuadBoxOf(quad)[2], quad.partId).toBeLessThan(tip)
          }
        }
      })
    },
  )
})
