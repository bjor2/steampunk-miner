import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromCanonical } from '../../../systems/money'
import { ATTACH_IDS } from '../../../systems/registries/vehicleAttach'
import { LOADOUT_SLOT_IDS } from '../../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../../ui/vectorIcons'
import {
  EXTRACTION_ITEMS,
  itemPriceOf,
  techNodeOf,
  vehicleItemOf,
  type ExtractionItem,
} from './extractionItems'

const ONE_OFF = { band: 5, oreUnits: fromCanonical('15') }

const iconIdsOf = (item: ExtractionItem) => [item.iconId, item.node.iconId]

describe('extraction items', () => {
  it('sells the mineral drain and the slurry siphon, the two #162 extraction power-ups', () => {
    expect(EXTRACTION_ITEMS.map((item) => item.itemId)).toEqual([
      'power.mineral_drain',
      'power.slurry_siphon',
    ])
  })

  it('ships every item and node icon it names (#162 acceptance 1)', () => {
    const missing = EXTRACTION_ITEMS.flatMap(iconIdsOf).filter((id) => iconUrlOf(id) === null)
    expect(missing).toEqual([])
  })

  it('writes each description with no digits in at most 80 characters', () => {
    for (const { description } of EXTRACTION_ITEMS) {
      expect(description).not.toMatch(/\d/)
      expect(description.length).toBeLessThanOrEqual(80)
    }
  })

  it('never says "rig" in a name or description (#162 acceptance 2)', () => {
    const text = EXTRACTION_ITEMS.flatMap((item) => [item.name, item.description]).join(' ')
    expect(text).not.toMatch(/\brigs?\b/i)
  })

  it('goes in any power-up slot and draws at that slot: one attach id each', () => {
    for (const item of EXTRACTION_ITEMS) {
      const row = vehicleItemOf(item)
      expect(row.slots).toEqual(LOADOUT_SLOT_IDS.filter((slot) => slot.startsWith('powerup.')))
      expect(row.attach === 'slot' || ATTACH_IDS.includes(row.attach as never)).toBe(true)
    }
  })

  it('puts the drain at P9 after the Resonance Fork and the siphon at P16 after the drain (#161)', () => {
    expect(
      EXTRACTION_ITEMS.map(techNodeOf).map(({ id, unlockTier, prereqs, unlocks }) => ({
        id,
        unlockTier,
        prereqs,
        unlocks,
      })),
    ).toEqual([
      {
        id: 'tech.extraction.mineral_drain',
        unlockTier: 9,
        prereqs: ['tech.extraction.resonance_fork'],
        unlocks: 'power.mineral_drain',
      },
      {
        id: 'tech.extraction.slurry_siphon',
        unlockTier: 16,
        prereqs: ['tech.extraction.mineral_drain'],
        unlocks: 'power.slurry_siphon',
      },
    ])
  })

  it('labels each node horizontal, a capability of the extraction lane with income-item Marks', () => {
    for (const node of EXTRACTION_ITEMS.map(techNodeOf)) {
      expect(node).toMatchObject({
        lane: 'extraction',
        label: 'horizontal',
        costKind: 'capability',
      })
      expect(node.marks?.isIncomeItem).toBe(true)
    }
  })

  it('prices each item at 15 band-5 ore on its unlock planet, through bandOrePriceAt', () => {
    expect(EXTRACTION_ITEMS.map(itemPriceOf)).toEqual([
      bandOrePriceAt(ONE_OFF, 9, 9),
      bandOrePriceAt(ONE_OFF, 16, 16),
    ])
  })
})
