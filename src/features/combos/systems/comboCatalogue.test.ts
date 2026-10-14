import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { flavourProblemsOf } from '../../descriptions'
import { TECH_LANES, type TechNode } from '../../tech-tree'
import { COMBO_ITEMS, comboItemOf } from './comboCatalogue'

/** #162 milestone combos table; the ceiling anchor at P36 or later (#288, after #279). */
const AUTHORED = [
  ['combo.assay_drain', 15],
  ['combo.magnetic_survey', 18],
  ['combo.foam_cutters', 21],
  ['combo.alarm_shield', 24],
  ['combo.cored_drain', 28],
  ['combo.ceiling_anchor', 36],
] as const

/** The four templates Content wrote on 7 Oct: endless only, no authored node (ticket 206). */
const ENDLESS_ONLY = [
  'combo.lodestone_drain',
  'combo.lens_corer',
  'combo.foam_grapple',
  'combo.aether_reel',
]

/** #162 4.5 and the GD on ticket 206 (7 Oct). */
const INCOME_COMBOS = [
  'combo.assay_drain',
  'combo.cored_drain',
  'combo.lodestone_drain',
  'combo.lens_corer',
]

/** #202 holds stabiliser foam back, so its node is not in the loaded tree. */
const HELD_PARENT = 'tech.terrain.stabiliser_foam'

const laneOfNode = (nodeId: string) => nodeId.split('.')[1].replace('_', '-')

describe('combo catalogue', () => {
  it('gives every combo an icon that resolves and a flavour line within the copy rules', () => {
    COMBO_ITEMS.forEach((item) => {
      expect(iconUrlOf(item.iconId), item.itemId).not.toBeNull()
      expect(flavourProblemsOf(item.description), item.itemId).toEqual([])
      expect(/\brig\b/i.test(`${item.name} ${item.description}`), item.itemId).toBe(false)
    })
  })

  it('names icon ids from the item ids, item- and node- with dashes (#158)', () => {
    COMBO_ITEMS.forEach((item) => {
      const dashed = item.itemId.replaceAll(/[._]/g, '-')
      expect(item.iconId).toBe(`item-${dashed}`)
      if (item.node !== null) expect(item.node.iconId).toBe(`node-${dashed}`)
    })
  })

  it('researches the six authored combos at the research lab from P15', () => {
    const authored = COMBO_ITEMS.filter((item) => item.node !== null)
    expect(authored.map((item) => [item.itemId, item.node?.unlockTier])).toEqual(AUTHORED)
    authored.forEach((item) => expect(item.node?.id).toBe(`tech.${item.itemId}`))
  })

  it('gives the four Content templates no authored node', () => {
    const endless = COMBO_ITEMS.filter((item) => item.node === null)
    expect(endless.map((item) => item.itemId)).toEqual(ENDLESS_ONLY)
  })

  it('counts the drain combos, the lodestone drain and the lens corer under the 15% cap', () => {
    const income = COMBO_ITEMS.filter((item) => item.isIncomeCombo).map((item) => item.itemId)
    expect(income).toEqual(INCOME_COMBOS)
  })

  it('takes one parent from each of its two different lanes', () => {
    COMBO_ITEMS.forEach((item) => {
      expect(item.lanes[0]).not.toBe(item.lanes[1])
      expect(item.lanes.every((lane) => TECH_LANES.includes(lane))).toBe(true)
      expect(item.parents.map(laneOfNode), item.itemId).toEqual(item.lanes)
    })
  })

  it('names parents the loaded lane slices register, but the foam #202 holds back', () => {
    const loaded = new Set(contentOf('tech-node').map((node) => (node as TechNode).id))
    const parents = COMBO_ITEMS.flatMap((item) => item.parents)
    const missing = [...new Set(parents.filter((parent) => !loaded.has(parent)))]
    expect(missing).toEqual([HELD_PARENT])
  })

  it('names as parent items the store items its parent nodes unlock', () => {
    const unlocksOf = new Map(
      contentOf('tech-node').map((node) => [node.id, (node as TechNode).unlocks]),
    )
    COMBO_ITEMS.forEach((item) =>
      item.parents.forEach((parent, index) => {
        const unlocks = unlocksOf.get(parent)
        if (unlocks !== undefined) expect(item.parentItemIds[index], parent).toBe(unlocks)
      }),
    )
  })

  it('finds a combo by its item id, and nothing for another lane', () => {
    expect(comboItemOf('combo.alarm_shield')?.name).toBe('Alarm shield')
    expect(comboItemOf('power.mineral_drain')).toBeNull()
  })
})
