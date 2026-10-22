import { describe, expect, it } from 'vitest'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import {
  EMPTY_MANIFEST,
  manifestWithinHold,
  manifestWithUnit,
  takeSoldKinds,
  type HeldManifest,
  type HeldUnit,
} from './heldManifest'

const RARE: SeenRarity = { lead: 2, rarity: 'rare', tint: [0.2, 0.4, 1], pulse: 0 }

function unit(tier: number, key: string, rarity: HeldUnit['rarity'] = null): HeldUnit {
  return { tier, key, name: key, rarity }
}

function manifestOf(units: readonly HeldUnit[]): HeldManifest {
  return units.reduce(manifestWithUnit, EMPTY_MANIFEST)
}

function countsOf(manifest: HeldManifest): [string, number][] {
  return manifest.map((kind) => [`${kind.tier}/${kind.key}`, kind.count])
}

describe('held manifest', () => {
  it('counts units of one kind and tier together, in the order the kinds came in', () => {
    const manifest = manifestOf([unit(3, 'a'), unit(4, 'b'), unit(3, 'a'), unit(3, 'c')])
    expect(countsOf(manifest)).toEqual([
      ['3/a', 2],
      ['4/b', 1],
      ['3/c', 1],
    ])
  })

  it('names a kind by a rarity a later unit of it was seen at', () => {
    const manifest = manifestOf([unit(3, 'a'), unit(3, 'a', RARE)])
    expect(manifest[0].rarity).toEqual(RARE)
  })

  it('cuts a tier back to what the hold holds, the latest kinds first', () => {
    const manifest = manifestOf([unit(3, 'a'), unit(3, 'a'), unit(3, 'b'), unit(4, 'c')])
    expect(countsOf(manifestWithinHold(manifest, { '3': 2, '4': 1 }))).toEqual([
      ['3/a', 2],
      ['4/c', 1],
    ])
  })

  it('drops a tier the hold no longer holds', () => {
    const manifest = manifestOf([unit(3, 'a'), unit(4, 'c')])
    expect(countsOf(manifestWithinHold(manifest, { '4': 1 }))).toEqual([['4/c', 1]])
  })

  it('sells every kind of a sold tier and leaves the other tiers held', () => {
    const manifest = manifestOf([unit(3, 'a'), unit(3, 'b'), unit(4, 'c')])
    const { sold, manifest: left } = takeSoldKinds(manifest, [{ tier: 3, amount: 2 }])
    expect(countsOf(sold)).toEqual([
      ['3/a', 1],
      ['3/b', 1],
    ])
    expect(countsOf(left)).toEqual([['4/c', 1]])
  })

  it("sells the units no pickup named as the tier's own kind", () => {
    const { sold } = takeSoldKinds(manifestOf([unit(3, 'a')]), [{ tier: 3, amount: 5 }])
    expect(countsOf(sold)).toEqual([
      ['3/a', 1],
      ['3/tier:3', 4],
    ])
    expect(sold[1]).toMatchObject({ name: null, rarity: null })
  })
})
