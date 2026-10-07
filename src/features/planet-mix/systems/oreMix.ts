/**
 * A planet's ore mix (#141 "Distribution formula"): per band, which ore types appear and with what
 * weight. Both: the families are horizontal, the tiers and #140's lead weights vertical.
 *
 * For planet `p` (from P3) and band `b`, with `t_b = 3(p-1) + b` and #140's lead weights:
 *
 *   lead 0   weight 1 - plus1 - plus2   the band's type: `commons[t_b mod 2]`, the rare on a swapped band 3
 *   lead +1  weight plus1               the type of tier t_b + 1 (see below)
 *   lead +2  weight plus2               the type of tier t_b + 2
 *   signature                           `<signature>_t<t_5>`, bands 4 and 5 only
 *
 * A tier up to `t_5` wears that band's type (a deeper ore turning up early, no new type); `t_5 + 1`
 * wears the act's rare and `t_5 + 2` the planet's accent (`commons[t mod 2]` with no accent). The
 * signature is weight-neutral: it takes its share from the entry of its own tier `t_5` (band 4's
 * +1, band 5's lead 0), ×2 on story planets and near lava (never stacked), clamped to #140's band
 * cap and to the entry it is carved from. P1 and P2 keep the legacy family stream: each lead entry
 * splits by the planet's family weights, and nothing else applies.
 */
import { isHeatPlanet } from '../../../systems/economy/heatEconomy'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { leadWeights, ORE_ROWS, oreTierOf, oreTypeOf } from '../../ores'
import { planetMixPlanOf, type PlanetMixPlan } from './planetActs'
import { THEME_ROWS, type ThemeRows } from './themeRows'

export const PLANET_MIX_HOOK_ID = 'planet-mix.mix'

export interface OreMixEntry {
  /** The catalogue id, `<family>_t<tier>`. */
  typeId: string
  family: string
  tier: number
  /** 0 for the band's own tier, +1 or +2 for #140's rarity lead; the signature's is its tier's. */
  lead: number
  /** Basis points of the band's ore patches; fractional only on the legacy planets P1 and P2. */
  weightBp: number
  signature: boolean
}

export interface OreMix {
  planetIndex: number
  /** The act's id (#141 `oreThemeId`). */
  themeId: string
  accent: string | null
  isBandThreeSwapped: boolean
  /** Bands 1 to 5, entries with a weight only. */
  bands: readonly (readonly OreMixEntry[])[]
}

const BASIS_POINTS = 10000
const LEADS = [0, 1, 2]
const BANDS = [1, 2, 3, 4, 5]

/** The mix of planet `p` in world `worldSeed` (#141's `oreMixFor(planetIndex, seed)`). */
export function oreMixFor(planetIndex: number, worldSeed: number): OreMix {
  return oreMixOf(planetParamsFor(worldSeed, planetIndex))
}

/** The mix of the planet these params make, under the mix hook's seed. */
export function oreMixOf(params: PlanetParams): OreMix {
  return mixOf(params, false)
}

/** The mix of a heat-act patch near a lava pocket, where the signature share doubles (#141). */
export function oreMixNearLavaOf(params: PlanetParams): OreMix {
  return mixOf(params, isHeatPlanet(params.planetIndex))
}

/** The mix hook's sub-seed: every planet-wide and per-patch roll of the mix derives from it. */
export function mixSeedOf(params: PlanetParams): number {
  return subSeedForHook(params, PLANET_MIX_HOOK_ID)
}

/** Whether the planet rolls its own mix; P1 and P2 keep the legacy family stream. */
export function isMixedPlanet(planetIndex: number, rows: ThemeRows = THEME_ROWS): boolean {
  return planetIndex >= rows.mixFromPlanet
}

/** The family a tier wears on the planet: band types up to `t_5`, then the rare, then the accent. */
export function familyAtTier(plan: PlanetMixPlan, tier: number): string {
  const band = tier - oreTierOf(plan.planetIndex, 1, 0) + 1
  if (band <= BAND_COUNT) return bandFamilyOf(plan, band, tier)
  if (band === BAND_COUNT + 1) return plan.act.rare ?? commonAt(plan, tier)
  return plan.accent ?? commonAt(plan, tier)
}

/**
 * The basis points of band `b`'s patches that wear the signature: the act's share, ×2 on a story
 * planet or near lava, clamped to #140's cap and to the entry it is carved from.
 */
export function signatureShareBpOf(
  plan: PlanetMixPlan,
  band: number,
  isNearLava: boolean,
  rows: ThemeRows = THEME_ROWS,
): number {
  if (!isMixedPlanet(plan.planetIndex, rows)) return 0
  const share = rows.signatureShareBpByBand[band - 1]
  const boosted = plan.isStoryPlanet || isNearLava ? share * rows.signatureBoost : share
  return Math.min(boosted, signatureCapBpOf(band), leadBucketsBpOf(band)[signatureLeadOf(band)])
}

/** The lead whose tier is `t_5`, the one the signature shares: +1 in band 4, 0 in band 5. */
export function signatureLeadOf(band: number): number {
  return BAND_COUNT - band
}

/** #140's patch shares of leads 0, +1 and +2 in a band, in basis points. */
export function leadBucketsBpOf(band: number): [number, number, number] {
  const { plus1Bp, plus2Bp } = leadWeights(band)
  return [BASIS_POINTS - plus1Bp - plus2Bp, plus1Bp, plus2Bp]
}

function mixOf(params: PlanetParams, isNearLava: boolean): OreMix {
  const plan = planetMixPlanOf(params.planetIndex, mixSeedOf(params))
  return {
    planetIndex: params.planetIndex,
    themeId: plan.act.id,
    accent: plan.accent,
    isBandThreeSwapped: plan.isBandThreeSwapped,
    bands: BANDS.map((band) => bandEntriesOf(params, plan, band, isNearLava)),
  }
}

function signatureCapBpOf(band: number): number {
  return ORE_ROWS.signatureShareCapBpByBand[String(band)] ?? 0
}

function bandEntriesOf(
  params: PlanetParams,
  plan: PlanetMixPlan,
  band: number,
  isNearLava: boolean,
): OreMixEntry[] {
  const entries = isMixedPlanet(params.planetIndex)
    ? mixedEntriesOf(plan, band, signatureShareBpOf(plan, band, isNearLava))
    : legacyEntriesOf(params, band)
  return entries.filter((entry) => entry.weightBp > 0)
}

function mixedEntriesOf(plan: PlanetMixPlan, band: number, signatureBp: number): OreMixEntry[] {
  const buckets = leadBucketsBpOf(band)
  const carved = (lead: number) => (lead === signatureLeadOf(band) ? signatureBp : 0)
  const leadEntries = LEADS.map((lead) => {
    const tier = oreTierOf(plan.planetIndex, band, lead)
    return entryOf(familyAtTier(plan, tier), tier, lead, buckets[lead] - carved(lead), false)
  })
  return [...leadEntries, signatureEntryOf(plan, band, signatureBp)]
}

function signatureEntryOf(plan: PlanetMixPlan, band: number, weightBp: number): OreMixEntry {
  const lead = signatureLeadOf(band)
  const tier = oreTierOf(plan.planetIndex, band, lead)
  return entryOf(plan.act.signature ?? commonAt(plan, tier), tier, lead, weightBp, true)
}

/** P1 and P2: each lead entry split by the archetype's family weights, as the lattice draws them. */
function legacyEntriesOf(params: PlanetParams, band: number): OreMixEntry[] {
  const buckets = leadBucketsBpOf(band)
  const weights = Object.entries(params.familyWeights)
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  return LEADS.flatMap((lead) =>
    weights.map(([family, weight]) => {
      const tier = oreTierOf(params.planetIndex, band, lead)
      return entryOf(family, tier, lead, (buckets[lead] * weight) / total, false)
    }),
  )
}

function entryOf(
  family: string,
  tier: number,
  lead: number,
  weightBp: number,
  signature: boolean,
): OreMixEntry {
  return { typeId: oreTypeOf(family, tier).id, family, tier, lead, weightBp, signature }
}

function bandFamilyOf(plan: PlanetMixPlan, band: number, tier: number): string {
  const isSwapped = band === 3 && plan.isBandThreeSwapped && plan.act.rare !== null
  return isSwapped ? (plan.act.rare as string) : commonAt(plan, tier)
}

/** `commons[t mod 2]`: alternating by tier alternates by band and carries bands 4-5 into 1-2. */
function commonAt(plan: PlanetMixPlan, tier: number): string {
  const commons = plan.act.commons
  if (commons === null) throw new RangeError(`act "${plan.act.id}" has no commons to mix`)
  return commons[tier % 2]
}
