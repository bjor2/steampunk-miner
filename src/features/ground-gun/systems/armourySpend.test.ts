import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { familySpendRowsOf } from '../../../systems/registries/spendFamilies'
import { ARMOURY_SPEND_FAMILY } from './armourySpend'
import { AUTO_GUNS_MODULES } from './autoGunsLane'
import { MOUNT_PART_ID, trackPartIdOf } from './boreGunContent'
import { SHIPPED_BORE_GUN_MODULES } from './boreGunLane'

// The spend guard's one `armoury` row (#310 Systems point 2; ticket 371): every weapon buy, the
// kernel turret's included, folds into one row a planet, read from the family tag.

function sliceSpend(planetIndex: number, boughtId: string, cost: string): ShopSpend {
  return {
    planetIndex,
    source: 'slice',
    purchaseId: 'tech-tree.research',
    boughtId,
    cost: fromCanonical(cost),
  }
}

function kernelSpend(planetIndex: number, purchaseId: string, cost: string): ShopSpend {
  return { planetIndex, source: 'kernel', purchaseId, cost: fromCanonical(cost) }
}

const canonical = (amount: string) => toCanonical(fromCanonical(amount))

/** The rows with only this slice's family registered, every anchor live. */
function rowsAsText(spends: readonly ShopSpend[]) {
  const slice: SliceDefinition = {
    id: 'ground-gun',
    register: (r) => r.spendFamily(ARMOURY_SPEND_FAMILY),
  }
  return withRegistrations([slice], () =>
    familySpendRowsOf(spends, () => true).map((row) => ({ ...row, spend: toCanonical(row.spend) })),
  )
}

const SIGHT = SHIPPED_BORE_GUN_MODULES[0]
const DIRECTOR = AUTO_GUNS_MODULES[0]

describe('armoury spend family', () => {
  it('folds a module’s node, item and Marks into one armoury row a planet', () => {
    const rows = rowsAsText([
      sliceSpend(2, SIGHT.node.id, '100'),
      sliceSpend(2, SIGHT.itemId, '40'),
      sliceSpend(5, `tech.mark.${SIGHT.itemId}.2`, '70'),
    ])
    expect(rows).toEqual([
      { planetIndex: 2, familyId: 'ground-gun.armoury', spend: canonical('140') },
      { planetIndex: 5, familyId: 'ground-gun.armoury', spend: canonical('70') },
    ])
  })

  it('files the turret mount here, not under kernel.buy_gun', () => {
    const rows = rowsAsText([kernelSpend(4, 'buyGun', '250')])
    expect(rows).toEqual([
      { planetIndex: 4, familyId: 'ground-gun.armoury', spend: canonical('250') },
    ])
  })

  it('counts the bore gun mount, its tracks and the auto_guns lane modules', () => {
    const rows = rowsAsText([
      sliceSpend(1, MOUNT_PART_ID, '5'),
      sliceSpend(1, trackPartIdOf('rate'), '6'),
      sliceSpend(1, DIRECTOR.node.id, '7'),
      sliceSpend(1, `tech.mark.${DIRECTOR.itemId}.3`, '8'),
    ])
    expect(rows).toEqual([
      { planetIndex: 1, familyId: 'ground-gun.armoury', spend: canonical('26') },
    ])
  })

  it('leaves out other items, their Marks and the kernel’s other buys', () => {
    const rows = rowsAsText([
      sliceSpend(3, 'power.ore_shifter', '30'),
      sliceSpend(3, 'tech.mark.power.ore_shifter.2', '30'),
      kernelSpend(3, 'buyUpgrade', '500'),
      { ...sliceSpend(3, SIGHT.itemId, '9'), source: 'kernel' },
    ])
    expect(rows).toEqual([])
  })
})
