import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import type { PartSwapRequest } from '../../../systems/registries/partMotionRequests'
import { coveredItemIdsOf, coversOf, type PointHolder } from '../../../systems/render/swapCovers'
import { EMPTY_LOADOUT, type VehicleLoadout } from '../../../systems/vehicle/loadoutState'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import {
  forkMountsOf,
  gearAttachIdOf,
  MOUNTED_GEAR,
  mountedGearOf,
  mountedItemsOf,
  type MountedItem,
} from '../../tech-tree'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { itemLookCountOf, itemLookOfPlayer, type ActiveForkBranchRead } from './rigItemLookCounts'
import { SHIPPED_RIG_LOOKS } from './rigLooks'
import { ownedPurchasesOf } from './rigLookSource'

// The drill types at the max loadout (ticket 623; HS and G&V rows of the GD lock of 25 Oct on
// #623): with every type active, the winner takes the drill head, every other type still shows
// by its own item art, and nothing draws twice. And the looks are look-only: reading them every
// step changes no state, at drill levels 1, 101 and 1e6 with the cutters' Mark 2 (VS).

const PLAYER = 'p1'
const LANE = 'drill-gear'
const TWIN_BIT = 'gear.twin_bit'
const CUTTERS = 'gear.side_cutters'
const BOOM = 'gear.reach_boom'
const CUTTERS_MARK_2 = 'gear.side_cutters_mark_2'
const DRILL_TYPE_SLOTS = { 'drill.head': TWIN_BIT, 'drill.flank': CUTTERS, 'drill.collar': BOOM }
const BRANCHES = ['wide', 'deep']

function maxLoadoutOf(): VehicleLoadout {
  return {
    slots: { ...EMPTY_LOADOUT.slots, ...DRILL_TYPE_SLOTS },
    owned: [BOOM, CUTTERS, CUTTERS_MARK_2, TWIN_BIT],
  }
}

function stateWith(loadout: VehicleLoadout): AuthorityState {
  const state = createScriptedSession().state()
  const player = state.players[PLAYER]
  const vehicle = { ...player.vehicle, loadout }
  return { ...state, players: { ...state.players, [PLAYER]: { ...player, vehicle } } }
}

/** What draws each item's own art, as the rig gear mounts it: the loadout, then the fork piece. */
function itemArtOf(loadout: VehicleLoadout, branch: string): PointHolder[] {
  const items = mountedItemsOf(loadout).flatMap(holderOfItem)
  const pieces = forkMountsOf(LANE, branch).flatMap((mount) => {
    const gear = MOUNTED_GEAR.find((row) => row.assetId === mount.assetId)
    const isMounted = items.some((item) => item.itemIds.includes(gear?.itemId ?? ''))
    return gear === undefined || isMounted
      ? []
      : [{ attachId: mount.attachId, itemIds: [gear.itemId] }]
  })
  return [...items, ...pieces]
}

function holderOfItem(item: MountedItem): PointHolder[] {
  const gear = mountedGearOf(item.itemId)
  const attachId = gear === null ? null : gearAttachIdOf(gear, item.slot)
  return attachId === null ? [] : [{ attachId, itemIds: [item.itemId] }]
}

/** Every type's look and the drill tip's at `drillN`, in the scene's order. */
function ownedLooksOf(state: AuthorityState, read: ActiveForkBranchRead, drillN: number) {
  const drillTip = SHIPPED_RIG_LOOKS.tracks.find((frames) => frames.rows.track === 'drill_tip')!
  return [
    ...SHIPPED_RIG_LOOKS.items.map((frames) => itemLookOfPlayer(frames, state, PLAYER, read)),
    lookFrameAt(drillTip, drillN),
  ]
}

interface SettledRig {
  art: PointHolder[]
  swaps: PartSwapRequest[]
}

/** The swaps against the item art, the covered art stepped aside, until nothing changes. */
function settledRigOf(holders: readonly PointHolder[], looks: readonly RigLookFrame[]): SettledRig {
  let covered: string[] = []
  for (let step = 0; step < 4; step++) {
    const art = holders.filter((holder) => !holder.itemIds.some((id) => covered.includes(id)))
    const swaps = partSwapsOf(looks, art)
    const next = coveredItemIdsOf(swaps)
    if (next.join() === covered.join()) return { art, swaps }
    covered = next
  }
  throw new Error(`the rig never settles: ${covered.join(', ')}`)
}

/** How many times an item draws: by its own art plus by looks covering it. */
function drawsOf(rig: SettledRig, itemId: string): number {
  const art = rig.art.filter((holder) => holder.itemIds.includes(itemId)).length
  return art + rig.swaps.filter((swap) => coversOf(swap).includes(itemId)).length
}

describe('drill types at the max loadout (ticket 623)', () => {
  it.each(BRANCHES)(
    'gives the head to the twin bit with the %s branch active, every other type shown by its own art, none twice',
    (branch) => {
      const loadout = maxLoadoutOf()
      const read: ActiveForkBranchRead = (_state, _player, lane) => (lane === LANE ? branch : null)
      const holders = itemArtOf(loadout, branch)
      const rig = settledRigOf(holders, ownedLooksOf(stateWith(loadout), read, 101))
      expect(rig.swaps.filter((swap) => swap.attach === 'drill.head')).toEqual([
        expect.objectContaining({ partIds: ['twin-bit-head'], covers: [TWIN_BIT] }),
      ])
      expect(rig.art.map((holder) => holder.attachId)).toEqual(
        expect.arrayContaining(['drill.flank', 'drill.collar']),
      )
      const pieceIds = itemArtOf(EMPTY_LOADOUT, branch).flatMap((holder) => holder.itemIds)
      expect(pieceIds.length).toBeGreaterThan(0)
      for (const itemId of [TWIN_BIT, CUTTERS, BOOM, ...pieceIds]) {
        expect({ itemId, draws: drawsOf(rig, itemId) }).toEqual({ itemId, draws: 1 })
      }
    },
  )
})

describe('drill type looks are look-only (ticket 623)', () => {
  const noFork: ActiveForkBranchRead = () => null

  function playRun(drillN: number, readLooks: (state: AuthorityState) => void): string {
    const session = createScriptedSession()
    session.submit(1, setVehicleLoadoutCommand(DRILL_TYPE_SLOTS, maxLoadoutOf().owned))
    session.submit(2, setUpgradeCommand('drill_tip', drillN))
    expect(session.state().players[PLAYER].vehicle.loadout.slots['drill.head']).toBe(TWIN_BIT)
    expect(ownedPurchasesOf(session.state(), PLAYER, 'drill_tip')).toBe(drillN)
    for (let tick = 3; tick < 40; tick++) {
      session.advanceTo(tick)
      readLooks(session.state())
    }
    return stateDigest(session.state())
  }

  function readEveryLook(state: AuthorityState): void {
    const drillN = ownedPurchasesOf(state, PLAYER, 'drill_tip')
    partSwapsOf(ownedLooksOf(state, noFork, drillN), [])
  }

  it.each([1, 101, 1_000_000])(
    'plays byte-identical at drill level %i with the cutters on Mark 2, looked at every step or not',
    (drillN) => {
      expect(playRun(drillN, readEveryLook)).toBe(playRun(drillN, () => undefined))
    },
  )

  it('reads the Mark only off the loadout, never a level, a price or a stat', () => {
    const paths = new Set<string>()
    const watch = (value: unknown, path: string): unknown =>
      typeof value !== 'object' || value === null
        ? value
        : new Proxy(value, {
            get(target, key) {
              const at = `${path}.${String(key)}`
              paths.add(at)
              return watch(Reflect.get(target, key), at)
            },
          })
    const state = watch(stateWith(maxLoadoutOf()), 'state') as AuthorityState
    for (const frames of SHIPPED_RIG_LOOKS.items)
      itemLookCountOf(frames.rows, state, PLAYER, noFork)
    const read = [...paths].filter((path) => !path.startsWith('state.players.p1.vehicle.loadout'))
    expect(read).toEqual(['state.players', 'state.players.p1', 'state.players.p1.vehicle'])
  })
})
