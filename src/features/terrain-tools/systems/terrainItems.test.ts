import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { ATTACH_IDS } from '../../../systems/registries/vehicleAttach'
import { LOADOUT_SLOT_IDS } from '../../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../../ui/vectorIcons'
import {
  itemPriceOf,
  TERRAIN_ITEMS,
  techNodeOf,
  terrainItemOf,
  vehicleItemOf,
  type TerrainItem,
} from './terrainItems'

const ONE_OFF = { band: 5, oreUnits: fromCanonical('15') }

const PER_UNIT = { band: 5, oreUnits: fromCanonical('2') }

const POWER_UP_SLOT_IDS = LOADOUT_SLOT_IDS.filter((slot) => slot.startsWith('powerup.'))

const iconIdsOf = (item: TerrainItem) => [item.iconId, item.node.iconId]

/** #162 section 1: `item-<id>` with dots and underscores turned into dashes. */
const itemIconIdOf = (itemId: string) => `item-${itemId.replace(/[._]/g, '-')}`

describe('terrain items', () => {
  it('sells the eight #162 terrain manipulation items, the spoil auger and cradle left out', () => {
    expect(TERRAIN_ITEMS.map((item) => item.itemId)).toEqual([
      'consumable.stabiliser_foam',
      'power.ore_shifter',
      'consumable.seam_splitter',
      'power.pressure_pocket',
      'consumable.cryo_binder',
      'consumable.lodestone_beacon',
      'consumable.shoring_props',
      'power.strata_press',
    ])
  })

  it('names each icon after its id and ships every item and node icon (#162 acceptance 1)', () => {
    expect(TERRAIN_ITEMS.map((item) => item.iconId)).toEqual(
      TERRAIN_ITEMS.map((item) => itemIconIdOf(item.itemId)),
    )
    const missing = TERRAIN_ITEMS.flatMap(iconIdsOf).filter((id) => iconUrlOf(id) === null)
    expect(missing).toEqual([])
  })

  it('writes each description with no digits in at most 80 characters', () => {
    for (const { description } of TERRAIN_ITEMS) {
      expect(description).not.toMatch(/\d/)
      expect(description.length).toBeLessThanOrEqual(80)
    }
  })

  it('never says "rig" in a name or description (#162 acceptance 2)', () => {
    const text = TERRAIN_ITEMS.flatMap((item) => [item.name, item.description]).join(' ')
    expect(text).not.toMatch(/\brigs?\b/i)
  })

  it('goes in any power-up slot with one attach id: its slot when charged, the rack when not', () => {
    for (const item of TERRAIN_ITEMS) {
      const row = vehicleItemOf(item)
      expect(row.slots).toEqual(POWER_UP_SLOT_IDS)
      expect(row.attach).toBe(item.powerUpClass === 'charged' ? 'slot' : 'hull.rear')
      expect(row.attach === 'slot' || ATTACH_IDS.includes(row.attach as never)).toBe(true)
    }
  })

  it('places each node on the #161 terrain lane with its planet, prereqs and discovery', () => {
    expect(
      TERRAIN_ITEMS.map(techNodeOf).map(({ id, unlockTier, prereqs, requiresDiscovery }) => [
        id,
        unlockTier,
        prereqs,
        requiresDiscovery ?? null,
      ]),
    ).toEqual([
      ['tech.terrain.stabiliser_foam', 3, [], null],
      ['tech.terrain.ore_shifter', 6, [], null],
      ['tech.terrain.seam_splitter', 10, ['tech.terrain.ore_shifter'], null],
      ['tech.terrain.pressure_pocket', 14, ['tech.terrain.seam_splitter'], null],
      ['tech.terrain.cryo_binder', 17, ['tech.terrain.stabiliser_foam'], 'hazard:frozen'],
      ['tech.terrain.lodestone_beacon', 23, ['tech.terrain.ore_shifter'], null],
      ['tech.terrain.shoring_props', 29, ['tech.terrain.cryo_binder'], null],
      ['tech.terrain.strata_press', 35, ['tech.terrain.shoring_props'], null],
    ])
  })

  it('labels each node a horizontal terrain capability that unlocks its own item', () => {
    for (const item of TERRAIN_ITEMS) {
      expect(techNodeOf(item)).toMatchObject({
        lane: 'terrain',
        label: 'horizontal',
        costKind: 'capability',
        unlocks: item.itemId,
        iconId: `node-terrain-${item.node.id.split('.')[2].replace(/_/g, '-')}`,
      })
    }
  })

  it('tags the ore movers as income items: shifter, splitter, pocket lance and lodestone (#161)', () => {
    const incomeIds = TERRAIN_ITEMS.filter((item) => techNodeOf(item).marks?.isIncomeItem)
    expect(incomeIds.map((item) => item.itemId)).toEqual([
      'power.ore_shifter',
      'consumable.seam_splitter',
      'power.pressure_pocket',
      'consumable.lodestone_beacon',
    ])
  })

  it('gives consumables a stack and no cooldown in their Mark ladder (#162 4.6)', () => {
    const foam = techNodeOf(terrainItemOf('consumable.stabiliser_foam')!).marks
    expect(foam).toEqual({ isIncomeItem: false, magnitude: { base: 16, limit: 32 }, charges: 4 })
  })

  it('prices a charged item at 15 band-5 ore on its unlock planet, on every planet', () => {
    const shifter = terrainItemOf('power.ore_shifter')!
    expect(itemPriceOf(shifter, 6)).toEqual(bandOrePriceAt(ONE_OFF, 6, 6))
    expect(itemPriceOf(shifter, 30)).toEqual(bandOrePriceAt(ONE_OFF, 6, 6))
  })

  it('prices a consumable unit at 2 band-5 ore on the planet it is restocked on', () => {
    const splitter = terrainItemOf('consumable.seam_splitter')!
    expect(itemPriceOf(splitter, 12)).toEqual(bandOrePriceAt(PER_UNIT, 12, 12))
    expect(itemPriceOf(splitter, 30)).toEqual(bandOrePriceAt(PER_UNIT, 30, 30))
  })
})
