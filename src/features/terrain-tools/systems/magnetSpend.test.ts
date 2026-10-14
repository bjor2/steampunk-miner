import { describe, expect, it } from 'vitest'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { LODESTONE_BEACON_NODE_ID, TERRAIN_MAGNETS_FAMILY } from './magnetItems'
import { magnetFamilySpendRowsOf } from './magnetSpend'

// The terrain magnets' one #212 spend-guard row (GD lock on #246 "Spend"; ticket 287): every
// member's node, Mark and item spend on a planet folds into one `terrain_magnets` row.

function sliceSpend(planetIndex: number, boughtId: string, cost: string): ShopSpend {
  return {
    planetIndex,
    source: 'slice',
    purchaseId: 'tech-tree.buy-item',
    boughtId,
    cost: fromCanonical(cost),
  }
}

/** `amount` as a row's spend reads in canonical text. */
const canonical = (amount: string) => toCanonical(fromCanonical(amount))

function rowsAsText(spends: readonly ShopSpend[]) {
  return magnetFamilySpendRowsOf(spends).map((row) => ({ ...row, spend: toCanonical(row.spend) }))
}

describe('terrain magnets spend row', () => {
  it('folds both members and their nodes into one terrain_magnets row a planet', () => {
    const rows = rowsAsText([
      sliceSpend(25, 'tech.terrain.repulsor_coil', '100'),
      sliceSpend(25, 'power.repulsor_coil', '40'),
      sliceSpend(28, 'tech.terrain.lode_clamp', '200'),
      sliceSpend(28, 'power.lode_clamp', '60'),
      sliceSpend(28, 'tech.terrain.repulsor_coil', '7'),
    ])
    expect(rows).toEqual([
      { planetIndex: 25, familyId: TERRAIN_MAGNETS_FAMILY, spend: canonical('140') },
      { planetIndex: 28, familyId: TERRAIN_MAGNETS_FAMILY, spend: canonical('267') },
    ])
  })

  it('leaves out the beacon, other items and the kernel purchases', () => {
    const rows = rowsAsText([
      sliceSpend(25, LODESTONE_BEACON_NODE_ID, '100'),
      sliceSpend(25, 'consumable.lodestone_beacon', '10'),
      sliceSpend(25, 'power.ore_shifter', '30'),
      { planetIndex: 25, source: 'kernel', purchaseId: 'buyUpgrade', cost: fromCanonical('500') },
    ])
    expect(rows).toEqual([])
  })
})
