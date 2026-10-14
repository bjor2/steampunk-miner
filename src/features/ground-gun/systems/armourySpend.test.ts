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
import { GROUND_GUN } from './groundGunEconomy'

// The spend guard's one `armoury` row (#310 Systems point 2; ticket 371): every weapon buy through
// a slice folds into one row a planet, read from the family tag. The kernel turret's mount is a
// one-time unlock filed under kernel.buy_gun alone, and the gun-track pin counts recurring buys
// only (GD ruling on #371).

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

const isPinned = (spend: ShopSpend) => ARMOURY_SPEND_FAMILY.sharePin?.isPinned(spend) ?? false

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

  it('files the turret mount once, under kernel.buy_gun, never in the armoury row or its pin', () => {
    const mount = kernelSpend(4, 'buyGun', '250')
    expect(rowsAsText([mount])).toEqual([
      { planetIndex: 4, familyId: 'kernel.buy_gun', spend: canonical('250') },
    ])
    expect(ARMOURY_SPEND_FAMILY.sharePin?.isPinned(mount)).toBe(false)
  })

  it('pins the bore gun’s track levels, lane nodes, modules and Marks', () => {
    const recurring = [
      sliceSpend(1, trackPartIdOf('penetration'), '6'),
      sliceSpend(2, SIGHT.node.id, '100'),
      sliceSpend(2, SIGHT.itemId, '40'),
      sliceSpend(5, `tech.mark.${DIRECTOR.itemId}.2`, '70'),
    ]
    expect(recurring.filter((spend) => isPinned(spend))).toEqual(recurring)
  })

  it('leaves the bore gun’s one-time mount out of the pin, though the armoury row counts it', () => {
    const mount = sliceSpend(1, MOUNT_PART_ID, '5')
    expect(isPinned(mount)).toBe(false)
    expect(rowsAsText([mount])).toEqual([
      { planetIndex: 1, familyId: 'ground-gun.armoury', spend: canonical('5') },
    ])
  })

  it('caps the pinned share at the slice’s spend pin', () => {
    expect(ARMOURY_SPEND_FAMILY.sharePin?.maxShare).toEqual(GROUND_GUN.spendPin.maxShare)
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
