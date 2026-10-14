import { describe, expect, it } from 'vitest'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { flavourProblemsOf } from '../../descriptions'
import { lastMarkOf } from '../../tech-tree'
import {
  BORE_GUN_LANE,
  BORE_GUN_MODULES,
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  GIMBAL_SIGHT_ITEM_ID,
  LONG_BARREL_ITEM_ID,
  markLadderOf,
  SHIPPED_BORE_GUN_MODULES,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './boreGunLane'
import { longBarrelMasteredMark } from './boreLadders'

/** Content's table on #310 as the GD locked it: node, planet, prerequisites. */
const CONTENT_TABLE = [
  ['tech.bore_gun.gimbal_sight', 2, []],
  ['tech.bore_gun.steam_sear', 6, ['tech.bore_gun.gimbal_sight']],
  ['tech.bore_gun.long_barrel', 12, ['tech.bore_gun.gimbal_sight']],
  ['tech.bore_gun.splay_choke', 18, ['tech.bore_gun.long_barrel']],
  ['tech.bore_gun.cementing_round', 23, ['tech.bore_gun.long_barrel']],
  ['tech.bore_gun.earthing_spike', 28, ['tech.bore_gun.long_barrel']],
  ['tech.bore_gun.rifled_bore', 33, ['tech.bore_gun.long_barrel']],
  ['tech.bore_gun.strut_bore', 37, ['tech.bore_gun.cementing_round']],
]

const ALL_EIGHT_IDS = BORE_GUN_MODULES.map((module) => module.itemId)

function registeredLaneNodes() {
  return contentOf('tech-node').filter((node) => node.lane === BORE_GUN_LANE)
}

function cardLines(itemId: string, level: number) {
  const state = createAuthorityState({ planetIndex: 12, planetSeed: 83921, playerIds: ['p1'] })
  const ctx = { playerId: 'p1', planetIndex: 12, level, view: itemSnapshotViewOf(state, 'p1') }
  const lines = describeItem({ kind: 'vehicle-item', id: itemId }, ctx)?.statLines ?? []
  return lines.map(({ label, now, next }) => ({ label, now, next }))
}

describe('ground-gun: the armoury.bore_gun lane (ticket 318, Content on #310)', () => {
  it("authors Content's eight nodes on their planets, each anchored on the bore_gun row", () => {
    expect(BORE_GUN_MODULES.map(({ node }) => [node.id, node.unlockTier, node.prereqs])).toEqual(
      CONTENT_TABLE,
    )
    expect(BORE_GUN_MODULES.find((m) => m.itemId === 'weapon.cementing_round')?.node).toMatchObject(
      { alsoRequiresFeature: ['casing_cement'] },
    )
    expect(BORE_GUN_MODULES.find((m) => m.itemId === EARTHING_SPIKE_ITEM_ID)?.node).toMatchObject({
      alsoRequiresFeature: ['grounded_lining'],
    })
    expect(BORE_GUN_MODULES.flatMap(({ node }) => node.requiresDiscovery ?? []).sort()).toEqual([
      'hazard:hollow',
      'hazard:magnetic',
    ])
  })

  it('registers all eight modules, hidden until bore_gun unlocks, under armoury (ticket 380)', () => {
    const nodes = registeredLaneNodes()
    expect(nodes.map((node) => node.unlocks).sort()).toEqual([...ALL_EIGHT_IDS].sort())
    expect(nodes.every((node) => node.requiresFeature?.includes('bore_gun'))).toBe(true)
    expect(nodes.every((node) => node.familyId === 'armoury')).toBe(true)
    expect(nodes.every((node) => node.costKind === 'capability')).toBe(true)
    expect(BORE_GUN_MODULES.filter((module) => module.isHeldBack)).toEqual([])
  })

  it('anchors the cementing round on casing_cement and the earthing spike on grounded_lining', () => {
    const anchorsOf = (itemId: string) =>
      registeredLaneNodes().find((node) => node.unlocks === itemId)?.requiresFeature
    expect(anchorsOf(CEMENTING_ROUND_ITEM_ID)).toEqual(['bore_gun', 'casing_cement'])
    expect(anchorsOf(EARTHING_SPIKE_ITEM_ID)).toEqual(['bore_gun', 'grounded_lining'])
  })

  it('registers every module as a store item with an offer and a card', () => {
    const itemIds = contentOf('vehicle-item').map((item) => item.id)
    expect(ALL_EIGHT_IDS.filter((itemId) => !itemIds.includes(itemId))).toEqual([])
    expect(ALL_EIGHT_IDS.filter((itemId) => vehicleItemOfferOf(itemId, 40) === null)).toEqual([])
    expect(ALL_EIGHT_IDS.filter((itemId) => cardLines(itemId, 0).length < 2)).toEqual([])
  })

  it('writes every flavour line inside the #159 rules', () => {
    expect(BORE_GUN_MODULES.flatMap((module) => flavourProblemsOf(module.description))).toEqual([])
  })

  it('sells each shipped module once, at 15 band-5 units of its unlock planet (#162 4.1)', () => {
    for (const module of SHIPPED_BORE_GUN_MODULES) {
      const planet = module.node.unlockTier
      const price = bandOrePriceAt({ band: 5, oreUnits: fromCanonical('15') }, planet, planet)
      expect(vehicleItemOfferOf(module.itemId, planet)).toEqual({ name: module.name, price })
    }
  })

  it('runs the long barrel to its own Mastered Mark and every other module on the rotation', () => {
    expect(lastMarkOf(markLadderOf(LONG_BARREL_ITEM_ID))).toBe(longBarrelMasteredMark())
    expect(longBarrelMasteredMark()).toBe(11)
    expect(markLadderOf(STEAM_SEAR_ITEM_ID)).toEqual({ isIncomeItem: false, cooldown: 60 })
    expect(markLadderOf(GIMBAL_SIGHT_ITEM_ID)).toEqual({ isIncomeItem: true, cooldown: 30 })
  })

  it('cards the long barrel from the ladder the gun reads: reach, then hold, then Mastered', () => {
    expect(cardLines(LONG_BARREL_ITEM_ID, 0).slice(0, 2)).toEqual([
      { label: 'Bore reach (cells)', now: '5', next: '6' },
      { label: 'Hold before the collapse check (s)', now: '0.5', next: '0.5' },
    ])
    expect(cardLines(LONG_BARREL_ITEM_ID, 11).slice(0, 2)).toEqual([
      { label: 'Bore reach (cells)', now: '10', next: undefined },
      { label: 'Hold before the collapse check (s)', now: '0.75', next: undefined },
    ])
  })

  it("cards the sear's wait after a manual shot, with the price last", () => {
    const lines = cardLines(STEAM_SEAR_ITEM_ID, 1)
    expect(lines[0]).toEqual({ label: 'Waits after a manual shot (s)', now: '1', next: '0.916' })
    expect(lines.at(-1)?.label).toBe('Price')
  })

  it('cards the splay choke from the shape it bores: lines and the cadence it adds', () => {
    expect(cardLines(SPLAY_CHOKE_ITEM_ID, 0).slice(0, 2)).toEqual([
      { label: 'Lines a shot', now: '2', next: '2' },
      { label: 'Added to the wait between shots (s)', now: '0.25', next: '0.233' },
    ])
  })

  it("cards the cementing round's rounds a dock, its wait and its extra energy", () => {
    expect(cardLines(CEMENTING_ROUND_ITEM_ID, 0).slice(0, 3)).toEqual([
      { label: 'Rounds a dock', now: '3', next: '3' },
      { label: 'Waits between rounds (s)', now: '2', next: '1.833' },
      { label: "Extra energy a cell (the drill's)", now: '1', next: '1' },
    ])
  })

  it("cards the strut bore's standing time and struts a dock", () => {
    expect(cardLines(STRUT_BORE_ITEM_ID, 0).slice(0, 2)).toEqual([
      { label: 'A strut stands for (s)', now: '10', next: '11.5' },
      { label: 'Struts a dock', now: '2', next: '2' },
    ])
  })
})
