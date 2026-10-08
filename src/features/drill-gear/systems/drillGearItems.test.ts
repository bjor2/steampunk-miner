import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { bareCatalogueIdProblems } from '../../../systems/registries/catalogueIds'
import { ATTACH_IDS } from '../../../systems/registries/vehicleAttach'
import { iconUrlOf } from '../../../ui/vectorIcons'
import {
  DRILL_GEAR_ITEMS,
  itemPriceOf,
  techNodeOf,
  vehicleItemOf,
  type DrillGearItem,
} from './drillGearItems'

const ONE_OFF = { band: 5, oreUnits: fromCanonical('15') }

const iconIdsOf = (item: DrillGearItem) => [item.iconId, item.node.iconId]

const itemIdsIn = (slot: string) =>
  DRILL_GEAR_ITEMS.filter((item) => item.slot === slot).map((item) => item.itemId)

describe('drill-gear items', () => {
  it('sells the eight #162 drill-gear items in tree order', () => {
    expect(DRILL_GEAR_ITEMS.map((item) => item.itemId)).toEqual([
      'gear.vibratory_bit',
      'gear.spoil_auger',
      'gear.side_cutters',
      'gear.thaw_crown',
      'gear.twin_bit',
      'gear.sampling_corer',
      'gear.dielectric_bit',
      'gear.reach_boom',
    ])
  })

  it('ships every item and node icon it names (#162 acceptance 1)', () => {
    const missing = DRILL_GEAR_ITEMS.flatMap(iconIdsOf).filter((id) => iconUrlOf(id) === null)
    expect(missing).toEqual([])
  })

  it('writes each description with no digits in at most 80 characters', () => {
    for (const { description } of DRILL_GEAR_ITEMS) {
      expect(description).not.toMatch(/\d/)
      expect(description.length).toBeLessThanOrEqual(80)
    }
  })

  it('never says "rig" in a name or description (#162 acceptance 2)', () => {
    const text = DRILL_GEAR_ITEMS.flatMap((item) => [item.name, item.description]).join(' ')
    expect(text).not.toMatch(/\brigs?\b/i)
  })

  it('puts four heads on drill.head, the cutters on the flank and three parts on the collar', () => {
    expect(itemIdsIn('drill.head')).toEqual([
      'gear.vibratory_bit',
      'gear.thaw_crown',
      'gear.twin_bit',
      'gear.dielectric_bit',
    ])
    expect(itemIdsIn('drill.flank')).toEqual(['gear.side_cutters'])
    expect(itemIdsIn('drill.collar')).toEqual([
      'gear.spoil_auger',
      'gear.sampling_corer',
      'gear.reach_boom',
    ])
  })

  it('gives each row its one socket and draws it at the attach point of that name', () => {
    for (const item of DRILL_GEAR_ITEMS) {
      const row = vehicleItemOf(item)
      expect(row.slots).toEqual([item.slot])
      expect(row.attach).toBe(item.slot)
      expect(ATTACH_IDS).toContain(row.attach)
    }
  })

  it('names its nodes tech.drill_gear.*, ids the bare-id rule accepts (#205 GD lock)', () => {
    const nodeIds = DRILL_GEAR_ITEMS.map((item) => item.node.id)
    expect(nodeIds.every((id) => id.startsWith('tech.drill_gear.'))).toBe(true)
    expect(nodeIds.flatMap(bareCatalogueIdProblems)).toEqual([])
    expect(DRILL_GEAR_ITEMS.flatMap((item) => bareCatalogueIdProblems(item.itemId))).toEqual([])
  })

  it('places the nodes on the #161 planets, prereqs and discovery keys', () => {
    expect(
      DRILL_GEAR_ITEMS.map(techNodeOf).map(({ unlockTier, prereqs, requiresDiscovery }) => [
        unlockTier,
        prereqs.map((id) => id.replace('tech.drill_gear.', '')),
        requiresDiscovery ?? null,
      ]),
    ).toEqual([
      [4, [], null],
      [8, ['vibratory_bit'], null],
      [13, ['vibratory_bit'], null],
      [17, ['vibratory_bit'], 'hazard:frozen'],
      [19, ['vibratory_bit'], null],
      [24, ['spoil_auger'], null],
      [27, ['twin_bit'], 'hazard:magnetic'],
      [34, ['sampling_corer'], null],
    ])
  })

  it('lets only the side cutters node claim a schedule row: side_drills on P13 (#161)', () => {
    const claims = DRILL_GEAR_ITEMS.map(techNodeOf).filter((node) => node.scheduleRowId)
    expect(claims.map(({ id, scheduleRowId }) => [id, scheduleRowId])).toEqual([
      ['tech.drill_gear.side_cutters', 'side_drills'],
    ])
  })

  it('labels each node horizontal, a capability of the drill-gear lane that moves no ore', () => {
    for (const node of DRILL_GEAR_ITEMS.map(techNodeOf)) {
      expect(node).toMatchObject({
        lane: 'drill-gear',
        label: 'horizontal',
        costKind: 'capability',
      })
      expect(node.marks?.isIncomeItem).toBe(false)
    }
  })

  it('prices each item at 15 band-5 ore on its unlock planet, through bandOrePriceAt', () => {
    const forSale = DRILL_GEAR_ITEMS.filter((item) => !item.isHeldBack)
    expect(forSale.map(itemPriceOf)).toEqual(
      forSale.map((item) => bandOrePriceAt(ONE_OFF, item.node.unlockTier, item.node.unlockTier)),
    )
  })

  it('holds back nothing once the dielectric bit has its effect (#258 Q6, ticket 292)', () => {
    expect(DRILL_GEAR_ITEMS.filter((item) => item.isHeldBack)).toEqual([])
  })
})
