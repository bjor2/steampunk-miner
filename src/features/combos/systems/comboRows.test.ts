import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { flavourProblemsOf } from '../../descriptions'
import { isArmouryLane, RESEARCH_LAB_ROW_ID, TECH_LANES } from '../../tech-tree'
import { COMBO_ITEMS, comboItemOf } from './comboCatalogue'
import {
  authoredComboNodesOf,
  COMBO_TEMPLATES,
  comboPriceAt,
  techNodeOf,
  vehicleItemOf,
} from './comboRows'

/**
 * The ids `COMBO_TEMPLATES_FIXTURE` in tech-tree's spec fixtures has (ticket 206), the five
 * aetheric pairs Content wrote on ticket 373, which stand in the fixture as `aetheric_pair_1..5`,
 * and the three weapon x lane templates of ticket 320.
 */
const TEMPLATE_IDS = [
  'tech.template.aether_reel',
  'tech.template.alarm_shield',
  'tech.template.assay_drain',
  'tech.template.ceiling_anchor',
  'tech.template.cored_drain',
  'tech.template.foam_cutters',
  'tech.template.foam_grapple',
  'tech.template.lens_corer',
  'tech.template.lodestone_drain',
  'tech.template.lull_line',
  'tech.template.magnetic_survey',
  'tech.template.pendulum_anchor',
  'tech.template.quench_cutters',
  'tech.template.sounding_bore',
  'tech.template.spotter_guns',
  'tech.template.still_foam',
  'tech.template.warning_chime',
  'tech.template.winch_bore',
]

const pairKeyOf = (lanes: readonly string[]) => [...lanes].sort().join('×')

function everyLanePair(): string[] {
  return TECH_LANES.flatMap((lane, index) =>
    TECH_LANES.slice(index + 1).map((other) => pairKeyOf([lane, other])),
  )
}

describe('combo rows', () => {
  it('makes a vehicle item with no slot and no attach id: a combo mounts nothing new', () => {
    COMBO_ITEMS.forEach((item) =>
      expect(vehicleItemOf(item)).toEqual({
        id: item.itemId,
        iconId: item.iconId,
        slots: [],
        attach: null,
      }),
    )
  })

  it('makes a combo-lane node with no Marks that unlocks the combo item', () => {
    const drain = comboItemOf('combo.cored_drain')!
    expect(techNodeOf(drain, drain.node!)).toEqual({
      id: 'tech.combo.cored_drain',
      iconId: 'node-combo-cored-drain',
      lane: 'combo',
      name: 'Cored drain',
      unlockTier: 28,
      prereqs: ['tech.drill_gear.sampling_corer', 'tech.extraction.mineral_drain'],
      requiresOwned: ['gear.sampling_corer', 'power.mineral_drain'],
      unlocks: 'combo.cored_drain',
      description: drain.description,
      label: 'horizontal',
      costKind: 'combo',
    })
  })

  it('makes nodes only for the authored combos', () => {
    expect(authoredComboNodesOf(COMBO_ITEMS).map((node) => node.unlockTier)).toEqual([
      15, 18, 21, 24, 28, 36, 20, 25, 27,
    ])
  })

  it('hides a weapon combo behind the research lab and its anchor row, no other combo', () => {
    const nodeOfItem = (itemId: string) => {
      const item = comboItemOf(itemId)!
      return techNodeOf(item, item.node!)
    }
    expect(nodeOfItem('combo.sounding_bore').requiresFeature).toEqual([
      RESEARCH_LAB_ROW_ID,
      'bore_gun',
    ])
    expect(nodeOfItem('combo.spotter_guns').requiresFeature).toEqual([
      RESEARCH_LAB_ROW_ID,
      'auto_guns',
    ])
    expect(nodeOfItem('combo.assay_drain').requiresFeature).toBeUndefined()
  })

  it('prices a combo at 15 band-5 ore on the planet it unlocks on (#162 4.1)', () => {
    const cost = { band: 5, oreUnits: fromCanonical('15') }
    ;[15, 28, 41, 44].forEach((planet) =>
      expect(toCanonical(comboPriceAt(planet))).toBe(
        toCanonical(bandOrePriceAt(cost, planet, planet)),
      ),
    )
  })
})

describe('combo templates', () => {
  it('lists the fifteen pair templates and the three weapon templates by their ids', () => {
    expect(COMBO_TEMPLATES.map((template) => template.id).sort()).toEqual(TEMPLATE_IDS)
  })

  it('gives every pair of the six lanes exactly one template', () => {
    const pairTemplates = COMBO_TEMPLATES.filter((template) => !template.lanes.some(isArmouryLane))
    const pairs = pairTemplates.map((template) => pairKeyOf(template.lanes))
    expect(pairs.sort()).toEqual(everyLanePair().sort())
  })

  it('pairs each weapon template with one of the six lanes, behind the lab and its anchor', () => {
    const weapon = COMBO_TEMPLATES.filter((template) => template.lanes.some(isArmouryLane))
    expect(weapon.map((template) => template.lanes.filter(isArmouryLane).length)).toEqual([1, 1, 1])
    weapon.forEach((template) => {
      const item = comboItemOf(template.unlocks)!
      expect(template.requiresFeature).toEqual([RESEARCH_LAB_ROW_ID, ...item.anchorRowIds!])
    })
  })

  it('grades the combo item of its row, from the same two parents, both owned', () => {
    COMBO_ITEMS.forEach((item) => {
      const template = COMBO_TEMPLATES.find((row) => row.unlocks === item.itemId)
      expect(template?.parents, item.itemId).toEqual(item.parents)
      expect(template?.lanes, item.itemId).toEqual(item.lanes)
      expect(template?.requiresOwned, item.itemId).toEqual(item.parentItemIds)
    })
  })

  it('gives every template a node icon that resolves and a flavour line within the copy rules', () => {
    COMBO_TEMPLATES.forEach((template) => {
      expect(iconUrlOf(template.iconId), template.id).not.toBeNull()
      expect(flavourProblemsOf(template.description), template.id).toEqual([])
    })
  })
})
