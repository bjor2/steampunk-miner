import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical } from '../../../systems/money'
import { familyShareRowsOf, familyShareTableOf, type SeedSpends } from './familySpendShares'

// The family rows beside the #212 guard (GD ruling Q3, Q4): read from the kernel registry, shared
// out of each seed's planet spend, report-only. The kernel's own gun family stands in for every
// registered one, so no slice is registered here.

function spend(planetIndex: number, source: ShopSpend['source'], purchaseId: string, cost: string) {
  return { planetIndex, source, purchaseId, cost: fromCanonical(cost) }
}

/** A planet of 1,000 spent where the gun mount took `gunCost`. */
function gunPlanet(planetIndex: number, gunCost: number): ShopSpend[] {
  return [
    spend(planetIndex, 'kernel', 'buyGun', String(gunCost)),
    spend(planetIndex, 'kernel', 'buyUpgrade', String(1000 - gunCost)),
  ]
}

const live = (shopSpend: readonly ShopSpend[]): SeedSpends => ({
  shopSpend,
  isAnchorLive: () => true,
})

function rowsAsText(seeds: readonly SeedSpends[], reportPlanets: readonly number[] = []) {
  return withRegistrations([], () =>
    familyShareRowsOf(seeds, reportPlanets).map((row) => ({
      planetIndex: row.planetIndex,
      familyId: row.familyId,
      seedShares: row.seedShares.map(String),
      medianShare: String(row.medianShare),
    })),
  )
}

describe('tech tree: spend family rows', () => {
  it('shares the gun mount out of each seed’s planet spend, with the median', () => {
    const seeds = [live(gunPlanet(4, 100)), live(gunPlanet(4, 300)), live(gunPlanet(4, 200))]
    expect(rowsAsText(seeds)).toEqual([
      {
        planetIndex: 4,
        familyId: 'kernel.buy_gun',
        seedShares: ['0.1', '0.3', '0.2'],
        medianShare: '0.2',
      },
    ])
  })

  it('counts a seed that bought on the planet but not from the family at zero', () => {
    const noGun = [spend(4, 'kernel', 'buyUpgrade', '1000')]
    const [row] = rowsAsText([live(gunPlanet(4, 400)), live(noGun), live([])])
    expect(row.seedShares).toEqual(['0.4', '0'])
    expect(row.medianShare).toBe('0.2')
  })

  it('prints no row for a family whose anchor row is not live on any seed', () => {
    const held: SeedSpends = { shopSpend: gunPlanet(4, 100), isAnchorLive: () => false }
    expect(rowsAsText([held])).toEqual([])
  })

  it('gives every planet the family spent on its own row', () => {
    const rows = rowsAsText([live([...gunPlanet(4, 100), ...gunPlanet(5, 500)])])
    expect(rows.map((row) => [row.planetIndex, row.familyId])).toEqual([
      [4, 'kernel.buy_gun'],
      [5, 'kernel.buy_gun'],
    ])
  })

  it('prints every live family on a report planet, at zero when nothing was spent on it', () => {
    const rows = rowsAsText(
      [live([spend(2, 'kernel', 'buyUpgrade', '1000'), ...gunPlanet(4, 100)])],
      [2, 4],
    )
    expect(rows.map((row) => [row.planetIndex, row.familyId, row.medianShare])).toEqual([
      [2, 'kernel.buy_gun', '0'],
      [4, 'kernel.buy_gun', '0.1'],
    ])
  })

  it('prints nothing on a report planet no seed bought on, or for a family live on no seed', () => {
    const held: SeedSpends = { shopSpend: gunPlanet(4, 100), isAnchorLive: () => false }
    expect(rowsAsText([live(gunPlanet(4, 100))], [10])).toHaveLength(1)
    expect(rowsAsText([held], [4])).toEqual([])
  })

  it('folds every terrain magnet buy on a planet into the one family row its slice registered', () => {
    const magnetBuy = (boughtId: string, cost: string): ShopSpend => ({
      ...spend(26, 'slice', 'tech-tree.buy-item', cost),
      boughtId,
    })
    const planet = [
      magnetBuy('power.repulsor_coil', '100'),
      magnetBuy('power.lode_clamp', '150'),
      spend(26, 'kernel', 'buyUpgrade', '750'),
    ]
    const rows = familyShareRowsOf([live(planet)])
    expect(rows.map((row) => [row.familyId, String(row.medianShare)])).toEqual([
      ['terrain-tools.terrain_magnets', '0.25'],
    ])
  })

  it('writes one table line per row under its header', () => {
    const rows = withRegistrations([], () => familyShareRowsOf([live(gunPlanet(4, 200))]))
    const lines = familyShareTableOf(rows).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain('| P4 | kernel.buy_gun |')
  })
})
