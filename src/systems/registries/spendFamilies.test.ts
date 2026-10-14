import { describe, expect, it } from 'vitest'
import { loadSlices, withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { ShopSpend } from '../bot/shopSpend'
import { fromCanonical, toCanonical } from '../money'
import { createRegistrySet, swapRegistrySet } from './seal'
import {
  anchorRowProblemOf,
  BUY_GUN_SPEND_FAMILY,
  familySpendRowsOf,
  type SpendFamily,
} from './spendFamilies'

// The spend guard's families (ticket 370, TD lock on #212 Q3): slices register them, the report
// counts a family only while its anchor row is live, and a buy counts once. Fake slices register
// through withRegistrations, so no real slice is imported.

function sliceSpend(planetIndex: number, boughtId: string, cost: string): ShopSpend {
  return {
    planetIndex,
    source: 'slice',
    purchaseId: 'fake.buy',
    boughtId,
    cost: fromCanonical(cost),
  }
}

function kernelSpend(planetIndex: number, purchaseId: string, cost: string): ShopSpend {
  return { planetIndex, source: 'kernel', purchaseId, cost: fromCanonical(cost) }
}

/** A family claiming slice spends whose bought id starts with `boughtPrefix`. */
function familyOf(id: string, anchorRowId: string, boughtPrefix: string): SpendFamily {
  return {
    id,
    anchorRowId,
    isMember: (spend) => spend.boughtId?.startsWith(boughtPrefix) ?? false,
  }
}

function sliceOf(id: string, families: readonly SpendFamily[]): SliceDefinition {
  return { id, register: (r) => families.forEach((family) => r.spendFamily(family)) }
}

const DRILLS = familyOf('fake.drills', 'side_drills', 'drill.')
const SHIELDS = familyOf('fake.shields', 'shields', 'shield.')
/** Claims everything `fake.drills` claims, and sorts after it. */
const DRILLS_TOO = familyOf('fake.more_drills', 'side_drills', 'drill.')

const everyAnchorLive = () => true

function rowsAsText(
  slices: readonly SliceDefinition[],
  spends: readonly ShopSpend[],
  isAnchorLive: (rowId: string) => boolean = everyAnchorLive,
) {
  return withRegistrations(slices, () =>
    familySpendRowsOf(spends, isAnchorLive).map((row) => ({
      ...row,
      spend: toCanonical(row.spend),
    })),
  )
}

/** `amount` as a row's spend reads in canonical text. */
const canonical = (amount: string) => toCanonical(fromCanonical(amount))

describe('spend families', () => {
  it('reports no rows with no family registered and no gun bought', () => {
    const rows = rowsAsText(
      [],
      [sliceSpend(3, 'drill.side', '10'), kernelSpend(3, 'buyUpgrade', '5')],
    )
    expect(rows).toEqual([])
  })

  it('folds a family’s spend into one row a planet, by planet then family id', () => {
    const rows = rowsAsText(
      [sliceOf('fake', [SHIELDS, DRILLS])],
      [
        sliceSpend(7, 'shield.dome', '40'),
        sliceSpend(5, 'drill.side', '10'),
        sliceSpend(7, 'drill.side', '3'),
        sliceSpend(5, 'drill.side_mark_2', '20'),
        sliceSpend(5, 'other.thing', '99'),
      ],
    )
    expect(rows).toEqual([
      { planetIndex: 5, familyId: 'fake.drills', spend: canonical('30') },
      { planetIndex: 7, familyId: 'fake.drills', spend: canonical('3') },
      { planetIndex: 7, familyId: 'fake.shields', spend: canonical('40') },
    ])
  })

  it('counts a family only while its anchor row is owned or unlocked', () => {
    const spends = [sliceSpend(9, 'drill.side', '10'), sliceSpend(9, 'shield.dome', '40')]
    const liveRows = new Set(['shields'])
    const rows = rowsAsText([sliceOf('fake', [DRILLS, SHIELDS])], spends, (rowId) =>
      liveRows.has(rowId),
    )
    expect(rows).toEqual([{ planetIndex: 9, familyId: 'fake.shields', spend: canonical('40') }])
  })

  it('reports nothing for a family whose anchor row is held or unbuilt', () => {
    const rows = rowsAsText(
      [sliceOf('fake', [DRILLS])],
      [sliceSpend(9, 'drill.side', '10')],
      () => false,
    )
    expect(rows).toEqual([])
  })

  it('counts the kernel gun mount as the buy_gun family on its auto_guns row', () => {
    const rows = rowsAsText(
      [],
      [kernelSpend(4, 'buyGun', '250'), kernelSpend(4, 'buyUpgrade', '9')],
    )
    expect(rows).toEqual([{ planetIndex: 4, familyId: 'kernel.buy_gun', spend: canonical('250') }])
    expect(BUY_GUN_SPEND_FAMILY.anchorRowId).toBe('auto_guns')
    expect(anchorRowProblemOf(BUY_GUN_SPEND_FAMILY)).toBeNull()
  })

  it('counts a buy two families claim once, under the first by sorted id', () => {
    const rows = rowsAsText(
      [sliceOf('fake', [DRILLS_TOO, DRILLS])],
      [sliceSpend(2, 'drill.side', '10'), sliceSpend(2, 'drill.long', '5')],
    )
    expect(rows).toEqual([{ planetIndex: 2, familyId: 'fake.drills', spend: canonical('15') }])
  })

  it('keeps a buy with its first family when that family’s anchor is not live', () => {
    const rows = rowsAsText(
      [sliceOf('fake', [DRILLS, familyOf('fake.later', 'shields', 'drill.')])],
      [sliceSpend(2, 'drill.side', '10')],
      (rowId) => rowId === 'shields',
    )
    expect(rows).toEqual([])
  })
})

describe('spend family registration', () => {
  it('refuses a family id registered twice, naming the slices that registered it', () => {
    expect(() => withRegistrations([sliceOf('fake', [DRILLS, DRILLS])], () => undefined)).toThrow(
      /"fake.drills" is registered twice in "spendFamilies": by slice "fake" and by slice "fake"/,
    )
  })

  it('refuses an anchor row that is no stats.json row', () => {
    const typo = familyOf('fake.typo', 'side_drils', 'drill.')
    expect(() => withRegistrations([sliceOf('fake', [typo])], () => undefined)).toThrow(
      /spend family "fake.typo": its anchor row "side_drils" is no row/,
    )
  })

  it('refuses a family id without the slice prefix', () => {
    const bare = familyOf('drills', 'side_drills', 'drill.')
    expect(() => withRegistrations([sliceOf('fake', [bare])], () => undefined)).toThrow(
      /its ids start with "fake."/,
    )
  })

  it('refuses a family registered after the seal', () => {
    const previous = swapRegistrySet(createRegistrySet())
    try {
      loadSlices([])
      expect(() => loadSlices([sliceOf('fake', [DRILLS])])).toThrow(
        /after the registries were sealed/,
      )
    } finally {
      swapRegistrySet(previous)
    }
  })
})
