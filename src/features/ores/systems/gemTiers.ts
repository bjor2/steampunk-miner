/**
 * The gem tier's sale tiers (ticket 713, Systems' decision on #713; ticket 741, Systems' final spec
 * on #741): the k-th gem of planet p sells at
 *
 *   t_g(p, k) = t_top(p) + Δ_k        t_top(p) = oreTier(p, 5) + the planet's top rarity lead
 *
 * and is worth `G = V(t_g)`, V(t) = 10 * 1.5^(t - 1) (#6). Δ is `gemRows.ts`'s one ladder. The
 * formula holds for any planet from 1, whether or not a pool binds species to its gem slots (the
 * kernel's `planetRow` answers it as `gemSaleTiers`), and a gem kind of a planet's roster reads its
 * own rank's tier here. Vertical. Integer only.
 */
import { oreTier } from '../../../systems/economy/oreEconomy'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { gemTierLeadOf } from './gemRows'
import { poolOfPlanetUnder } from './kindRows'
import { ORE_ROWS } from './oreRows'
import { topLeadOf } from './rarityLeads'
import { rarityRowSetOf } from './rarityTiers'

/** `t_top`: band 5's ore tier plus the largest lead the planet's rarity rows draw under its rules. */
export function topOreTierOf(planetIndex: number, oreRulesVersion: number | undefined): number {
  return oreTier(planetIndex, BAND_COUNT) + topLeadOf(rarityRowSetOf(planetIndex, oreRulesVersion))
}

/** `t_g(p, k)` for every gem rank k, cheapest first. */
export function gemSaleTiersOf(planetIndex: number, oreRulesVersion: number | undefined): number[] {
  const top = topOreTierOf(planetIndex, oreRulesVersion)
  return ORE_ROWS.gems.tierLeads.map((lead) => top + lead)
}

/** The tier a kind slot sells at on the planet when it is one of the planet's gems; else null. */
export function gemSaleTierOfSlot(params: PlanetParams, slotId: string): number | null {
  const { planetIndex, oreRulesVersion } = params
  const pool = poolOfPlanetUnder(ORE_ROWS.kinds, planetIndex, oreRulesVersion)
  const lead = gemTierLeadOf(ORE_ROWS.gems, pool, slotId, oreRulesVersion)
  return lead === null ? null : topOreTierOf(planetIndex, oreRulesVersion) + lead
}
