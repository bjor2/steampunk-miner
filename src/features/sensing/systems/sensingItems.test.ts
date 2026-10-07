import { describe, expect, it } from 'vitest'
import { bandOrePrice, bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { ATTACH_IDS } from '../../../systems/registries/vehicleAttach'
import { LOADOUT_SLOT_IDS } from '../../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { SENSING_ITEMS, sensingItemOf, type SensingItem } from './sensingCatalogue'
import { itemPriceOf, markLadderOf, techNodeOf, vehicleItemOf } from './sensingItems'

const ONE_OFF = { band: 5, oreUnits: fromCanonical('15') }

const PER_UNIT = { band: 5, oreUnits: fromCanonical('2') }

const POWER_UP_SLOTS = LOADOUT_SLOT_IDS.filter((slot) => slot.startsWith('powerup.'))

const iconIdsOf = (item: SensingItem) => [item.iconId, item.node.iconId]

const itemNamed = (itemId: string) => sensingItemOf(itemId)!

/** The ladder's stat steps, without the milestones Marks 3, 6 and 9 bring (#256). */
function steppedLadderOf(itemId: string) {
  const { milestones: _milestones, ...stepped } = markLadderOf(itemNamed(itemId))
  return stepped
}

describe('sensing items', () => {
  it('sells the eight #162 sensing items, in tree order', () => {
    expect(SENSING_ITEMS.map((item) => item.itemId)).toEqual([
      'power.echo_sounder',
      'passive.threat_periscope',
      'passive.assay_lens',
      'passive.hazard_barometer',
      'consumable.flare_mortar',
      'consumable.signal_buoy',
      'power.galvanic_probe',
      'power.void_sounder',
    ])
  })

  it('ships every item and node icon it names (#162 acceptance 1)', () => {
    const missing = SENSING_ITEMS.flatMap(iconIdsOf).filter((id) => iconUrlOf(id) === null)
    expect(missing).toEqual([])
  })

  it('writes each description with no digits in at most 80 characters', () => {
    for (const { description } of SENSING_ITEMS) {
      expect(description).not.toMatch(/\d/)
      expect(description.length).toBeLessThanOrEqual(80)
    }
  })

  it('never says "rig" in a name or description (#162 acceptance 2)', () => {
    const text = SENSING_ITEMS.flatMap((item) => [item.name, item.description]).join(' ')
    expect(text).not.toMatch(/\brigs?\b/i)
  })

  it('slots the charged items and consumables in any power-up slot and owns the passives slotless', () => {
    for (const item of SENSING_ITEMS) {
      const expected = item.powerUpClass === 'passive' ? [] : POWER_UP_SLOTS
      expect(vehicleItemOf(item).slots).toEqual(expected)
    }
  })

  it('names exactly one attach point per item, as the TD socket amendments place them', () => {
    expect(Object.fromEntries(SENSING_ITEMS.map((item) => [item.itemId, item.attach]))).toEqual({
      'power.echo_sounder': 'hull.roof.aft',
      'passive.threat_periscope': 'hull.roof.fore',
      'passive.assay_lens': 'cab.gauge',
      'passive.hazard_barometer': 'cab.gauge',
      'consumable.flare_mortar': 'hull.rear',
      'consumable.signal_buoy': 'hull.rear',
      'power.galvanic_probe': 'slot',
      'power.void_sounder': 'slot',
    })
    for (const { attach } of SENSING_ITEMS) {
      expect(attach === 'slot' || ATTACH_IDS.includes(attach)).toBe(true)
    }
  })

  it('places the nodes at the #161 planets, prereqs and discovery keys', () => {
    expect(
      SENSING_ITEMS.map(techNodeOf).map((node) => [
        node.id,
        node.unlockTier,
        node.prereqs,
        node.requiresDiscovery ?? null,
      ]),
    ).toEqual([
      ['tech.sensing.echo_sounder', 2, [], null],
      ['tech.sensing.threat_periscope', 5, ['tech.sensing.echo_sounder'], 'enemy:tunnel_wrecker'],
      ['tech.sensing.assay_lens', 7, ['tech.sensing.echo_sounder'], null],
      ['tech.sensing.hazard_barometer', 7, ['tech.sensing.assay_lens'], 'hazard:heat_lava'],
      ['tech.sensing.flare_mortar', 13, ['tech.sensing.echo_sounder'], null],
      ['tech.sensing.signal_buoy', 21, ['tech.sensing.flare_mortar'], null],
      ['tech.sensing.galvanic_probe', 26, ['tech.sensing.hazard_barometer'], 'hazard:magnetic'],
      ['tech.sensing.void_sounder', 33, ['tech.sensing.galvanic_probe'], 'hazard:hollow'],
    ])
  })

  it('labels each node a horizontal capability of the sensing lane that unlocks its item', () => {
    for (const item of SENSING_ITEMS) {
      expect(techNodeOf(item)).toMatchObject({
        lane: 'sensing',
        label: 'horizontal',
        costKind: 'capability',
        unlocks: item.itemId,
      })
    }
  })

  it('ladders a charged item by cooldown, reveal time and charges, none of them income items', () => {
    expect(steppedLadderOf('power.echo_sounder')).toEqual({
      isIncomeItem: false,
      cooldown: 300,
      magnitude: { base: 600 },
      charges: 3,
    })
    expect(markLadderOf(itemNamed('power.void_sounder'))?.magnitude).toEqual({ base: 900 })
  })

  it('ladders a consumable by its ring radius and stack, with no cooldown', () => {
    expect(steppedLadderOf('consumable.flare_mortar')).toEqual({
      isIncomeItem: false,
      magnitude: { base: 6 },
      charges: 3,
    })
  })

  it('ladders a passive by its magnitude alone, with no cooldown and no charges (#162 4.6)', () => {
    const ladder = { isIncomeItem: false, magnitude: { base: 6 } }
    expect(steppedLadderOf('passive.assay_lens')).toEqual(ladder)
    expect(techNodeOf(itemNamed('passive.assay_lens')).marks).toEqual(
      markLadderOf(itemNamed('passive.assay_lens')),
    )
  })

  it("puts each shipped item's milestones at its class's Marks, and none on a held item (#256)", () => {
    const patternsOf = (itemId: string) =>
      (markLadderOf(itemNamed(itemId)).milestones ?? []).map(({ mark, pattern }) => [mark, pattern])
    const charged = [
      [3, 'second-tap'],
      [6, 'hold'],
      [9, 'sibling-link'],
    ]
    expect(patternsOf('power.echo_sounder')).toEqual(charged)
    expect(patternsOf('consumable.flare_mortar')).toEqual(charged)
    expect(patternsOf('passive.assay_lens')).toEqual([[3, 'sibling-link']])
    expect(patternsOf('power.void_sounder')).toEqual([])
  })

  it('prices a charged item or passive at 15 band-5 ore on its unlock planet, on any planet', () => {
    const echo = itemNamed('power.echo_sounder')
    const periscope = itemNamed('passive.threat_periscope')
    expect(itemPriceOf(echo, 30)).toEqual(bandOrePriceAt(ONE_OFF, 2, 2))
    expect(itemPriceOf(periscope, 9)).toEqual(bandOrePriceAt(ONE_OFF, 5, 5))
  })

  it('prices a consumable unit at 2 band-5 ore on the planet it is restocked on', () => {
    const buoy = itemNamed('consumable.signal_buoy')
    expect(itemPriceOf(buoy, 21)).toEqual(bandOrePrice(PER_UNIT, 21))
    expect(itemPriceOf(buoy, 30)).toEqual(bandOrePrice(PER_UNIT, 30))
  })
})
