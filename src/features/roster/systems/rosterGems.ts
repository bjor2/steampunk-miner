/**
 * The roster's gem tag (ticket 713, Systems' decision on #713 with Bjor's OK of 23 Oct; ticket 741):
 * a cell whose kind slot names one of its planet's gems sells at the gem's own integer tier,
 * `t_g = t_top + Δ` (the `ores` slice's `gemTiers.ts`). Only the sale tier maps (the TD's
 * signature-tier pattern); the cell's tier still decides its hardness and look, and its unit is kept
 * in the hold at `t_g`. A planet drawing its generated pool (ticket 888) sells the pool's three gems
 * at the tiers the pool names, `t_top(g) + 5/6/8`. Vertical.
 */
import type { OreGemTag } from '../../../systems/registries/oreTypes'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { gemSaleTierOfSlot, gemSaleTiersOf, type KindSlot } from '../../ores'
import { generatedGemSaleTierOf, isGeneratedPoolPlanet } from './generatedRoster'
import { rosterKindOf } from './planetRoster'

export const ROSTER_GEMS: OreGemTag = {
  id: 'roster.gems',
  gemSaleTierOf: (params, kindSlot) => gemSaleTierOfKind(params, rosterKindOf(params, kindSlot)),
}

/** The tier a kind of the planet's roster sells at when it is a gem; null for any other kind. */
export function gemSaleTierOfKind(params: PlanetParams, kind: KindSlot | null): number | null {
  if (kind === null) return null
  if (isGeneratedPoolPlanet(params)) return generatedGemSaleTierOf(params, kind.slotId)
  return gemSaleTierOfSlot(params, kind.slotId)
}

/**
 * The gem's rank k on its planet, cheapest first (ticket 786): how many of the planet's gem tiers
 * sell below its own, read from the price table, so k rises strictly with the price and is never
 * written down; null for any other kind. Look only: the rank glint (`gemGlint.ts`) reads it.
 */
export function gemRankOfKind(params: PlanetParams, kind: KindSlot | null): number | null {
  const saleTier = gemSaleTierOfKind(params, kind)
  if (saleTier === null) return null
  return gemRankAmong(gemSaleTiersOf(params.planetIndex, params.oreRulesVersion), saleTier)
}

/** How many of a planet's gem sale tiers sell below `saleTier`. */
export function gemRankAmong(saleTiers: readonly number[], saleTier: number): number {
  return saleTiers.filter((tier) => tier < saleTier).length
}
