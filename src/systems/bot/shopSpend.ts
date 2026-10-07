/**
 * The pacing bot's spend at the Upgrade bay, and the share of it slices took (ticket 211, the
 * diagnostic #165 logs and #212 guards). #161 section 3 defines the denominator as everything
 * bought on a planet, travel excluded: the kernel's purchases at what the wallet paid, a slice's
 * at its `estimateCost`. Reported only; nothing here fails a run.
 */
import { add, cmp, div, ZERO_MONEY, type Money } from '../money'

export interface ShopSpend {
  planetIndex: number
  /** `kernel` for the bot's own Upgrade bay purchases, `slice` for a registered `BotPurchase`. */
  source: 'kernel' | 'slice'
  /** The command type for a kernel purchase, the `BotPurchase` id for a slice's. */
  purchaseId: string
  cost: Money
}

export interface PlanetSpendShare {
  planetIndex: number
  sliceSpend: Money
  totalSpend: Money
  /** `sliceSpend / totalSpend`; zero on a planet where nothing was bought. */
  sliceShare: Money
}

/** One row per planet with any spend, ascending. */
export function spendShareByPlanet(spends: readonly ShopSpend[]): PlanetSpendShare[] {
  return planetsOf(spends).map((planetIndex) =>
    shareOf(
      planetIndex,
      spends.filter((spend) => spend.planetIndex === planetIndex),
    ),
  )
}

function planetsOf(spends: readonly ShopSpend[]): number[] {
  return [...new Set(spends.map((spend) => spend.planetIndex))].sort((a, b) => a - b)
}

function shareOf(planetIndex: number, spends: readonly ShopSpend[]): PlanetSpendShare {
  const totalSpend = sumOf(spends)
  const sliceSpend = sumOf(spends.filter((spend) => spend.source === 'slice'))
  const sliceShare = cmp(totalSpend, ZERO_MONEY) > 0 ? div(sliceSpend, totalSpend) : ZERO_MONEY
  return { planetIndex, sliceSpend, totalSpend, sliceShare }
}

function sumOf(spends: readonly ShopSpend[]): Money {
  return spends.map((spend) => spend.cost).reduce(add, ZERO_MONEY)
}
