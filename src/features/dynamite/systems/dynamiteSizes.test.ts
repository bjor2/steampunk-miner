import { describe, expect, it } from 'vitest'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { contentOf, contentScheduleRowClaims } from '../../../systems/registries/content'
import { chargeSpec as kernelChargeSpec } from '../../../systems/economy/chargeSizes'
import { chargeSpec, minChargeFor } from '../index'

describe('dynamite sizes: content', () => {
  it('registers one size entry per rung of the kernel ladder, each with its own icon', () => {
    const sizes = contentOf('dynamite-size')
    expect(sizes.map((entry) => entry.size)).toEqual([1, 10, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(sizes.map((entry) => entry.id)).toContain('dynamite.size_10')
    expect(sizes.filter((entry) => iconUrlOf(entry.iconId) === null)).toEqual([])
    expect(new Set(sizes.map((entry) => entry.iconId)).size).toBe(10)
  })

  it('ships the remote_detonator schedule row from the first plunger-only size', () => {
    expect(contentScheduleRowClaims().filter((claim) => claim.sliceId === 'dynamite')).toEqual([
      { rowId: 'remote_detonator', entryId: 'dynamite.size_7', sliceId: 'dynamite' },
    ])
  })
})

describe('dynamite sizes: the kernel ladder passed through for gates and looks', () => {
  it('answers chargeSpec with the kernel numbers: size 7 on planet 25 is 13 tiles and remote', () => {
    expect(chargeSpec(7, 25)).toEqual(kernelChargeSpec(7, 25))
    expect(chargeSpec(7, 25)).toMatchObject({ radiusMm: 13000, unlockPlanet: 25, fuseTicks: null })
    expect(chargeSpec(1, 7)).toMatchObject({ radiusMm: 2500, rackSlots: 1, fuseTicks: 120 })
  })

  it('answers minChargeFor capped by the cell band (#143 amendment 2)', () => {
    expect(minChargeFor({ lead: 1, band: 5 }, 7)).toBe(1)
    expect(minChargeFor({ lead: 2, band: 5 }, 22)).toBe(5)
    expect(minChargeFor({ lead: 2, band: 4 }, 40)).toBe(4)
  })
})
