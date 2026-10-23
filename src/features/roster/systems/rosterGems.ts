/**
 * The roster's gem tag (ticket 713, Systems' decision on #713 with Bjor's OK of 23 Oct): a cell
 * whose kind slot names a gem kind on its planet's roster sells at the gem's own integer tier,
 *
 *   t_g = t_top + Δ        t_top = oreTier(p, 5) + the planet's top rarity lead
 *
 * Δ is the slot's `gemTierLead` (5, 6 and 8, fixed from P1's Diamond, Emerald and Ruby: tiers 12,
 * 13 and 15, so 865, 1297 and 2919). Only the sale tier maps (the TD's signature-tier pattern); the
 * cell's tier still decides its hardness and look, and its unit is kept in the hold at `t_g`.
 * Vertical.
 */
import { oreTier } from '../../../systems/economy/oreEconomy'
import type { OreGemTag } from '../../../systems/registries/oreTypes'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { rarityRowSetOfPlanet, topLeadOf, type KindSlot } from '../../ores'
import { rosterKindOf } from './planetRoster'

export const ROSTER_GEMS: OreGemTag = {
  id: 'roster.gems',
  gemSaleTierOf: (params, kindSlot) => gemSaleTierOfKind(params, rosterKindOf(params, kindSlot)),
}

/** The tier a kind of the planet's roster sells at when it is a gem; null for any other kind. */
export function gemSaleTierOfKind(params: PlanetParams, kind: KindSlot | null): number | null {
  const lead = kind?.gemTierLead
  return lead === undefined ? null : topOreTierOf(params) + lead
}

/** `t_top`: band 5's ore tier plus the largest lead the planet's rarity rows draw. */
export function topOreTierOf(params: PlanetParams): number {
  return oreTier(params.planetIndex, BAND_COUNT) + topLeadOf(rarityRowSetOfPlanet(params))
}
