/**
 * A planet's ore mix (#141 "Distribution formula"): per band, which ore types appear and with what
 * weight. Both: the families are horizontal, the tiers and the rarity lead weights vertical.
 *
 * For planet `p` (from P3) and band `b`, with `t_b = 3(p-1) + b` and the planet's rarity rows
 * (`rarityLeads.ts`: #140's leads on the legacy rows, common to mythic on the mixed rows, ticket 445):
 *
 *   lead 0   the common weight          the band's type: `commons[t_b mod 2]`, the rare on a swapped band 3
 *   lead +k  the rows' weight of +k     the type of tier t_b + k (see below)
 *   signature                           `<signature>_t<t_5>`, bands 4 and 5 only
 *
 * A tier up to `t_5` wears that band's type (a deeper ore turning up early, no new type); `t_5 + 1`
 * wears the act's rare and anything above the planet's accent (`commons[t mod 2]` with no accent).
 * The signature is weight-neutral: ×2 on story planets and near lava (never stacked), clamped to
 * #140's band cap and to the entry it is carved from. On the legacy rows it takes its share from the
 * entry of its own tier `t_5` (band 4's +1, band 5's lead 0); on the mixed rows from the common entry
 * in both bands (Systems on #139, comment 6202970624 section 2: band 4's uncommon is too thin to host
 * it), still at tier `t_5`, so its value is unchanged. P1 and P2 keep the legacy family stream: each
 * lead entry splits by the planet's family weights, and nothing else applies.
 */
import { isHeatPlanet } from '../../../systems/economy/heatEconomy'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import { freshPlanetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import {
  ORE_ROWS,
  oreTierOf,
  oreTypeOf,
  rarityLeadBucketsBpOf,
  rarityLeads,
  rarityRowSetOfPlanet,
  type RarityRowSet,
} from '../../ores'
import { actOf, planetMixPlanOf, type PlanetMixPlan } from './planetActs'
import { THEME_ROWS, type ThemeRows } from './themeRows'

export const PLANET_MIX_HOOK_ID = 'planet-mix.mix'

export interface OreMixEntry {
  /** The catalogue id, `<family>_t<tier>`. */
  typeId: string
  family: string
  tier: number
  /** 0 for the band's own tier, +1 to +4 for the rarity lead; the signature's is its tier's. */
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

const BANDS = [1, 2, 3, 4, 5]

/** The mix of planet `p` in world `worldSeed` (#141's `oreMixFor(planetIndex, seed)`). */
export function oreMixFor(planetIndex: number, worldSeed: number): OreMix {
  return oreMixOf(freshPlanetParamsFor(worldSeed, planetIndex))
}

/** The mix of the planet these params make, under the mix hook's seed. */
export function oreMixOf(params: PlanetParams): OreMix {
  return mixOf(params, false)
}

/** The mix of a heat-act patch near a lava pocket, where the signature share doubles (#141). */
export function oreMixNearLavaOf(params: PlanetParams): OreMix {
  return mixOf(params, isHeatPlanet(params.planetIndex))
}

/**
 * The mix with every signature at the act's base share, as if no story planet or lava pocket
 * boosted it: the mix Systems' rarity model is solved on (comment 6202970624 on #139, sections 2
 * and 10, which leave the boosts outside mean preservation). The share bounds of ticket 449 judge
 * the tiers and the band mean on it.
 */
export function oreMixAtBaseSignatureOf(params: PlanetParams): OreMix {
  const plan = planetMixPlanOf(params.planetIndex, mixSeedOf(params))
  return mixOfPlan(params, { ...plan, isStoryPlanet: false }, false)
}

/** The mix hook's sub-seed: every planet-wide and per-patch roll of the mix derives from it. */
export function mixSeedOf(params: PlanetParams): number {
  return subSeedForHook(params, PLANET_MIX_HOOK_ID)
}

/** Whether the planet rolls its own mix; P1 and P2 keep the legacy family stream. */
export function isMixedPlanet(planetIndex: number, rows: ThemeRows = THEME_ROWS): boolean {
  return planetIndex >= rows.mixFromPlanet
}

/**
 * The family a tier wears on the planet: band types up to `t_5`, then the rare, then the accent.
 * Epic and mythic above `t_5 + 2` (ticket 445) wear the act's commons until #446 gives them their
 * kinds: `t_5 + 3` is the next planet's signature tier, and the signature tag reads only family and
 * tier (#232), so they must never wear that signature: not the accent, which may be it, and not a
 * common that is it (the Hollow act's radioactive is P41's), so the other common then.
 */
export function familyAtTier(plan: PlanetMixPlan, tier: number): string {
  const band = tier - oreTierOf(plan.planetIndex, 1, 0) + 1
  if (band <= BAND_COUNT) return bandFamilyOf(plan, band, tier)
  if (band === BAND_COUNT + 1) return plan.act.rare ?? commonAt(plan, tier)
  if (band === BAND_COUNT + 2) return plan.accent ?? commonAt(plan, tier)
  return commonOffNextSignatureAt(plan, tier)
}

/**
 * The basis points of band `b`'s patches that wear the signature: the act's share, ×2 on a story
 * planet or near lava, clamped to #140's cap and to the entry it is carved from.
 */
export function signatureShareBpOf(
  plan: PlanetMixPlan,
  band: number,
  isNearLava: boolean,
  set: RarityRowSet,
  rows: ThemeRows = THEME_ROWS,
): number {
  if (!isMixedPlanet(plan.planetIndex, rows)) return 0
  const share = rows.signatureShareBpByBand[band - 1]
  const boosted = plan.isStoryPlanet || isNearLava ? share * rows.signatureBoost : share
  const carvedFromBp = rarityLeadBucketsBpOf(set, band)[signatureCarveLeadOf(set, band)]
  return Math.min(boosted, signatureCapBpOf(band), carvedFromBp)
}

/** The lead whose tier is `t_5`, the signature's own tier: +1 in band 4, 0 in band 5. */
export function signatureLeadOf(band: number): number {
  return BAND_COUNT - band
}

/** The lead entry the signature is carved from: its own tier's on the legacy rows, common's on the mixed. */
export function signatureCarveLeadOf(set: RarityRowSet, band: number): number {
  return set === 'legacy' ? signatureLeadOf(band) : 0
}

function mixOf(params: PlanetParams, isNearLava: boolean): OreMix {
  return mixOfPlan(params, planetMixPlanOf(params.planetIndex, mixSeedOf(params)), isNearLava)
}

function mixOfPlan(params: PlanetParams, plan: PlanetMixPlan, isNearLava: boolean): OreMix {
  const set = rarityRowSetOfPlanet(params)
  return {
    planetIndex: params.planetIndex,
    themeId: plan.act.id,
    accent: plan.accent,
    isBandThreeSwapped: plan.isBandThreeSwapped,
    bands: BANDS.map((band) => bandEntriesOf(params, plan, set, band, isNearLava)),
  }
}

function signatureCapBpOf(band: number): number {
  return ORE_ROWS.signatureShareCapBpByBand[String(band)] ?? 0
}

function bandEntriesOf(
  params: PlanetParams,
  plan: PlanetMixPlan,
  set: RarityRowSet,
  band: number,
  isNearLava: boolean,
): OreMixEntry[] {
  const entries = isMixedPlanet(params.planetIndex)
    ? mixedEntriesOf(plan, set, band, signatureShareBpOf(plan, band, isNearLava, set))
    : legacyEntriesOf(params, set, band)
  return entries.filter((entry) => entry.weightBp > 0)
}

function mixedEntriesOf(
  plan: PlanetMixPlan,
  set: RarityRowSet,
  band: number,
  signatureBp: number,
): OreMixEntry[] {
  const buckets = rarityLeadBucketsBpOf(set, band)
  const carved = (lead: number) => (lead === signatureCarveLeadOf(set, band) ? signatureBp : 0)
  const leadEntries = rarityLeads().map((lead) => {
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
function legacyEntriesOf(params: PlanetParams, set: RarityRowSet, band: number): OreMixEntry[] {
  const buckets = rarityLeadBucketsBpOf(set, band)
  const weights = Object.entries(params.familyWeights)
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  return rarityLeads().flatMap((lead) =>
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

/** `commons[t mod 2]`, or the other common when that one is the next planet's signature. */
function commonOffNextSignatureAt(plan: PlanetMixPlan, tier: number): string {
  const common = commonAt(plan, tier)
  return common === actOf(plan.planetIndex + 1).signature ? commonAt(plan, tier + 1) : common
}

/** `commons[t mod 2]`: alternating by tier alternates by band and carries bands 4-5 into 1-2. */
function commonAt(plan: PlanetMixPlan, tier: number): string {
  const commons = plan.act.commons
  if (commons === null) throw new RangeError(`act "${plan.act.id}" has no commons to mix`)
  return commons[tier % 2]
}
