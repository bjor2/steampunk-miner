/**
 * Rarity on a planet (Systems on #139, comment 6202970624 sections 1 and 2; ticket 445): which
 * tiers a band draws, at what weight, and what each multiplies its band's ore value by. Vertical.
 *
 *   value(cell) = oreSalePrice(t_b + k)        hardness H(t_b + k)        multiplier valueRatio^k
 *
 * An id still maps to one price (`<family>_t<t_b + k>`), and there is no family multiplier: family
 * is look only (#140), so every price comes from `oreSalePrice(oreTierOf(p, b, k))`.
 *
 * Row sets (Horizontal Scaler, comment 6203133480 section 5): a planet entered under this build's
 * ore rules carries `oreRulesVersion` and draws the `mixed` weights once every tier is live there
 * (P3, where epic and mythic start); P1, P2 and any planet a save holds without the version keep
 * the `legacy` weights, today's lead rows, so a visited planet never seams against its own chunks.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import { powInt, type Money } from '../../../systems/money'
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import { ORE_ROWS, type OreRows } from './oreRows'
import type { RarityRowSet, RarityTier } from './rarityRows'

/** The ore rules a planet entered from this build carries: the kernel's, so it can stamp them. */
export { ORE_RULES_VERSION }

/** Common, uncommon, rare, epic and mythic, by tier offset. */
export function rarityTiers(rows: OreRows = ORE_ROWS): readonly RarityTier[] {
  return rows.rarity.tiers
}

export function rarityTierOf(tierOffset: number, rows: OreRows = ORE_ROWS): RarityTier {
  const tier = rows.rarity.tiers[tierOffset]
  if (tier === undefined) throw new RangeError(`no rarity tier at offset ${tierOffset}`)
  return tier
}

/** `valueRatio^k`: what a cell `k` tiers above its band sells for over the band's own ore. */
export function rarityMultiplierOf(tierOffset: number): Money {
  return powInt(ECONOMY.ore.valueRatio, tierOffset)
}

/** Whether band `band` of planet `planetIndex` draws the tier at all. */
export function isTierLiveIn(tier: RarityTier, planetIndex: number, band: number): boolean {
  return planetIndex >= tier.firstPlanet && band >= tier.firstBand
}

/** The planet the `mixed` weights start on: where the last tier goes live. */
export function mixedRowsFromPlanet(rows: OreRows = ORE_ROWS): number {
  return Math.max(...rows.rarity.tiers.map((tier) => tier.firstPlanet))
}

/** The weights a planet draws: `mixed` only under this build's ore rules and from P3. */
export function rarityRowSetOf(
  planetIndex: number,
  oreRulesVersion: number | undefined,
  rows: OreRows = ORE_ROWS,
): RarityRowSet {
  const isCurrentRules = oreRulesVersion === ORE_RULES_VERSION
  return isCurrentRules && planetIndex >= mixedRowsFromPlanet(rows) ? 'mixed' : 'legacy'
}

/** Basis points of band `band`'s ore cells that hold tier offset `k`, for `k` from 1. */
export function rarityWeightBpOf(
  set: RarityRowSet,
  tierOffset: number,
  band: number,
  rows: OreRows = ORE_ROWS,
): number {
  const weight = rows.rarity.weightsBpByBand[set][rarityTierOf(tierOffset, rows).id]?.[band - 1]
  if (weight === undefined) throw new RangeError(`no ${set} weight for offset ${tierOffset}`)
  return weight
}
