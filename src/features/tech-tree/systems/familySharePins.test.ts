import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical } from '../../../systems/money'
import type { SpendFamily } from '../../../systems/registries/spendFamilies'
import { brokenPinsOf, sharePinTableOf, sharePinVerdictsOf } from './familySharePins'
import type { SeedSpends } from './familySpendShares'

// The share pins beside the #212 guard (ticket 371, the gun-track ≤ 5% pin): a registered family
// pins part of its spend, judged per planet on the median of the seeds. A fake slice registers the
// family, so no real slice is imported.

function spend(planetIndex: number, boughtId: string, cost: string): ShopSpend {
  return {
    planetIndex,
    source: 'slice',
    purchaseId: 'fake.buy',
    boughtId,
    cost: fromCanonical(cost),
  }
}

/** Claims every `gun.` buy and pins all but the one-time `gun.mount`. */
const GUNS: SpendFamily = {
  id: 'fake.guns',
  anchorRowId: 'bore_gun',
  isMember: (each) => each.boughtId?.startsWith('gun.') ?? false,
  sharePin: {
    maxShare: fromCanonical('0.05'),
    isPinned: (each) => each.boughtId?.startsWith('gun.level') ?? false,
  },
}
const GUN_SLICE: SliceDefinition = { id: 'fake', register: (r) => r.spendFamily(GUNS) }

/** A planet of 1,000 spent where gun levels took `levelCost` and the mount `mountCost`. */
function gunPlanet(planetIndex: number, levelCost: number, mountCost = 0): ShopSpend[] {
  return [
    spend(planetIndex, 'gun.level.rate', String(levelCost)),
    spend(planetIndex, 'gun.mount', String(mountCost)),
    spend(planetIndex, 'drill', String(1000 - levelCost - mountCost)),
  ]
}

const live = (shopSpend: readonly ShopSpend[]): SeedSpends => ({
  shopSpend,
  isAnchorLive: () => true,
})

function verdictsAsText(seeds: readonly SeedSpends[]) {
  return withRegistrations([GUN_SLICE], () =>
    sharePinVerdictsOf(seeds).map((verdict) => ({
      planetIndex: verdict.planetIndex,
      familyId: verdict.familyId,
      seedShares: verdict.seedShares.map(String),
      medianShare: String(verdict.medianShare),
      isOverPin: verdict.isOverPin,
    })),
  )
}

describe('tech tree: spend family share pins', () => {
  it('shares the pinned buys out of each planet’s spend and leaves the unpinned mount out', () => {
    expect(verdictsAsText([live(gunPlanet(4, 30, 500))])).toEqual([
      {
        planetIndex: 4,
        familyId: 'fake.guns',
        seedShares: ['0.03'],
        medianShare: '0.03',
        isOverPin: false,
      },
    ])
  })

  it('judges every planet on the median of the seeds, over the pin only above it', () => {
    const seeds = [
      live([...gunPlanet(2, 50), ...gunPlanet(3, 0)]),
      live([...gunPlanet(2, 90), ...gunPlanet(3, 80)]),
      live([...gunPlanet(2, 10), ...gunPlanet(3, 60)]),
    ]
    const verdicts = verdictsAsText(seeds)
    expect(verdicts.map((each) => [each.planetIndex, each.medianShare, each.isOverPin])).toEqual([
      [2, '0.05', false],
      [3, '0.06', true],
    ])
  })

  it('counts a seed’s pinned buys only while the family’s anchor is live on its run', () => {
    const held: SeedSpends = { shopSpend: gunPlanet(5, 300), isAnchorLive: () => false }
    const [verdict] = verdictsAsText([held, live(gunPlanet(5, 300))])
    expect(verdict.seedShares).toEqual(['0', '0.3'])
  })

  it('judges nothing for a family no seed has live, or on a planet no seed paid on', () => {
    const held: SeedSpends = { shopSpend: gunPlanet(5, 300), isAnchorLive: () => false }
    expect(verdictsAsText([held])).toEqual([])
    expect(verdictsAsText([live([spend(6, 'drill', '0')])])).toEqual([])
  })

  it('lists the broken pins and writes one table line per verdict, marking a miss', () => {
    withRegistrations([GUN_SLICE], () => {
      const verdicts = sharePinVerdictsOf([live([...gunPlanet(2, 10), ...gunPlanet(3, 80)])])
      expect(brokenPinsOf(verdicts).map((verdict) => verdict.planetIndex)).toEqual([3])
      const lines = sharePinTableOf(verdicts).split('\n')
      expect(lines).toHaveLength(4)
      expect(lines[3]).toContain('| P3 | fake.guns |')
      expect(lines[3]).toContain('over the pin')
    })
  })
})
