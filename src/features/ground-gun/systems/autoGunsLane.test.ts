import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { flavourProblemsOf } from '../../descriptions'
import { lastMarkOf } from '../../tech-tree'
import { armouryModuleOf } from './armouryModules'
import {
  AUTO_GUNS_LANE,
  AUTO_GUNS_MODULES,
  autoGunsMarkLadderOf,
  CONCUSSION_SHELLS_ITEM_ID,
  EXTENDED_BARRELS_ITEM_ID,
  FIRE_DIRECTOR_ITEM_ID,
} from './autoGunsLane'
import {
  extendedBarrelsAt,
  extendedBarrelsMasteredMark,
  extendedBarrelsRangeMarks,
} from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const EXTENDED_BARRELS = EXTENDED_BARRELS_ITEM_ID
const ALL_EIGHT_IDS = AUTO_GUNS_MODULES.map((module) => module.itemId)

function registeredLaneNodes() {
  return contentOf('tech-node').filter((node) => node.lane === AUTO_GUNS_LANE)
}

function cardLines(itemId: string, level: number) {
  const state = createAuthorityState({ planetIndex: 19, planetSeed: 83921, playerIds: ['p1'] })
  const ctx = { playerId: 'p1', planetIndex: 19, level, view: itemSnapshotViewOf(state, 'p1') }
  const lines = describeItem({ kind: 'vehicle-item', id: itemId }, ctx)?.statLines ?? []
  return lines.map(({ label, now, next }) => ({ label, now, next }))
}

/** Content's table on #310 as the GD locked it: node, planet, prerequisites. */
const CONTENT_TABLE = [
  ['tech.auto_guns.fire_director', 11, []],
  ['tech.auto_guns.sentry_cam', 14, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.extended_barrels', 19, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.concussion_shells', 22, ['tech.auto_guns.fire_director']],
  ['tech.auto_guns.grapeshot_breech', 26, ['tech.auto_guns.extended_barrels']],
  ['tech.auto_guns.flushing_shell', 30, ['tech.auto_guns.concussion_shells']],
  ['tech.auto_guns.overpressure_burst', 35, ['tech.auto_guns.extended_barrels']],
  ['tech.auto_guns.ricochet_shot', 36, ['tech.auto_guns.extended_barrels']],
]

/** #364's `turret.*` groups (`docs/art/armoury/armouryMounts.json`). */
const ART_MOUNTS = {
  'weapon.fire_director': 'sight',
  'weapon.sentry_cam': 'cam',
  'weapon.extended_barrels': 'barrel',
  'weapon.concussion_shells': 'magazine',
  'weapon.grapeshot_breech': 'breech',
  'weapon.flushing_shell': 'cradle',
  'weapon.overpressure_burst': 'boiler',
  'weapon.ricochet_shot': 'hopper',
}

describe('ground-gun: the armoury.auto_guns lane (ticket 319, Content on #310)', () => {
  it("authors Content's eight nodes on their planets, the ricochet behind a hollow", () => {
    expect(AUTO_GUNS_MODULES.map(({ node }) => [node.id, node.unlockTier, node.prereqs])).toEqual(
      CONTENT_TABLE,
    )
    expect(AUTO_GUNS_MODULES.flatMap(({ node }) => node.requiresDiscovery ?? [])).toEqual([
      'hazard:hollow',
    ])
  })

  it('mounts every module on the turret group its art was made for', () => {
    expect(
      Object.fromEntries(AUTO_GUNS_MODULES.map(({ itemId, mount }) => [itemId, mount])),
    ).toEqual(ART_MOUNTS)
  })

  it("finds every module's numbers in groundGun.json, the barrels on their range ladder", () => {
    const rotating = AUTO_GUNS_MODULES.filter(({ itemId }) => itemId !== EXTENDED_BARRELS)
    expect(() => rotating.map(({ itemId }) => armouryModuleOf(itemId))).not.toThrow()
    expect(extendedBarrelsAt(extendedBarrelsRangeMarks()).rangeTiles).toBe(
      GROUND_GUN.turret.gunRangeCap,
    )
  })

  it('keeps every flavour line inside the #159 rules', () => {
    expect(AUTO_GUNS_MODULES.flatMap(({ description }) => flavourProblemsOf(description))).toEqual(
      [],
    )
  })

  it('registers all eight modules, hidden until auto_guns unlocks, under armoury (ticket 388)', () => {
    const nodes = registeredLaneNodes()
    expect(nodes.map((node) => node.unlocks).sort()).toEqual([...ALL_EIGHT_IDS].sort())
    expect(nodes.every((node) => node.requiresFeature?.join() === 'auto_guns')).toBe(true)
    expect(nodes.every((node) => node.familyId === 'armoury')).toBe(true)
    expect(nodes.every((node) => node.costKind === 'capability')).toBe(true)
    expect(AUTO_GUNS_MODULES.filter((module) => module.isHeldBack)).toEqual([])
  })

  it('adds no row to the horizontal schedule', () => {
    const rowIds = LOCKED_SCHEDULE.rows.map((row) => row.id)
    const laneIds = AUTO_GUNS_MODULES.flatMap(({ itemId, node }) => [itemId, node.id])
    expect(rowIds.filter((rowId) => laneIds.some((id) => id.endsWith(rowId)))).toEqual([])
  })

  it('registers every module as a store item with an offer and a card', () => {
    const itemIds = contentOf('vehicle-item').map((item) => item.id)
    expect(ALL_EIGHT_IDS.filter((itemId) => !itemIds.includes(itemId))).toEqual([])
    expect(ALL_EIGHT_IDS.filter((itemId) => vehicleItemOfferOf(itemId) === null)).toEqual([])
    expect(ALL_EIGHT_IDS.filter((itemId) => cardLines(itemId, 0).length < 2)).toEqual([])
  })

  it('sells each module once, at 15 band-5 units of its unlock planet (#162 4.1)', () => {
    for (const module of AUTO_GUNS_MODULES) {
      const planet = module.node.unlockTier
      const price = bandOrePriceAt({ band: 5, oreUnits: fromCanonical('15') }, planet, planet)
      expect(vehicleItemOfferOf(module.itemId)).toEqual({ name: module.name, price })
    }
  })

  it('runs the extended barrels to their own Mastered Mark and every other module on the rotation', () => {
    expect(lastMarkOf(autoGunsMarkLadderOf(EXTENDED_BARRELS))).toBe(extendedBarrelsMasteredMark())
    expect(extendedBarrelsAt(extendedBarrelsMasteredMark()).isMastered).toBe(true)
    expect(extendedBarrelsAt(extendedBarrelsMasteredMark() - 1).isMastered).toBe(false)
    expect(autoGunsMarkLadderOf(FIRE_DIRECTOR_ITEM_ID)).toEqual({
      isIncomeItem: false,
      cooldown: 30,
    })
  })

  it('cards the extended barrels from the ladder the turret reads: range, then energy a shot', () => {
    expect(cardLines(EXTENDED_BARRELS, 0).slice(0, 2)).toEqual([
      { label: 'Range (tiles)', now: '9', next: '10' },
      { label: 'Energy a shot', now: '0.5', next: '0.5' },
    ])
    expect(cardLines(EXTENDED_BARRELS, extendedBarrelsMasteredMark()).slice(0, 2)).toEqual([
      { label: 'Range (tiles)', now: '10', next: undefined },
      { label: 'Energy a shot', now: '0.25', next: undefined },
    ])
  })

  it("cards the concussion shells' knock-back and its wait, with the price last", () => {
    const lines = cardLines(CONCUSSION_SHELLS_ITEM_ID, 0)
    expect(lines.slice(0, 2)).toEqual([
      { label: 'Knock-back (cells)', now: '2', next: '2' },
      { label: 'Knocks one enemy at most every (s)', now: '3', next: '2.766' },
    ])
    expect(lines.at(-1)?.label).toBe('Price')
  })
})
