/**
 * Guard 2 under #142's share model (Systems on K8 #218, the follow-up table of ticket 247): for
 * each charge size, planet and band, what one charge is expected to free from the planet's real
 * mix, over its price. Beside `chargePayoff.ts` (the GD lock's patch model), never instead of it.
 *
 * - The band's cells are valued from `oreMixFor`'s weights at `1.5^lead` (a signature at its sale
 *   tier, as #142's guard values it), in units of the band's ore at `bandOreWorth` (Systems: "the
 *   ore price (`bandOrePriceAt`) of the gated cells a charge opens").
 * - `gated(n)` is the dynamite-gated lead entries a size `n` charge frees, those whose `minCharge`
 *   is at most `n`; their value share is capped by the 15% guard of the band's expected value.
 * - `valueFreed = inRadiusCount(r(n)) * min(gated(n), 15% of the band) * the band's ore`, kept
 *   ordinary ore left out; `price` is one charge of size `n` (`chargePrice`).
 *
 * Domain (#247 scope): planets 7 to 40 and 50, only bands with dynamite-gated lead cells, sizes up
 * to the band and open on the planet. Reported, gating nothing: #148 gates the bot's medians.
 */
import { inRadiusCount } from '../authority/charges/blastFront'
import { bandOreWorth } from '../economy/bandOreCost'
import { chargePrice, chargeRadiusMm, chargeSizesUpTo, largestSizeOn } from '../economy/chargeSizes'
import { oreTier, oreValue, signatureSaleTier } from '../economy/oreEconomy'
import { add, cmp, div, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../money'
import { GATED_VALUE_SHARE_CAP_BP, PAYOFF_PLANETS } from './chargePayoff'

/** One entry of a band's resolved gate table, as the mining-gates slice's `gateTableOf` reads it. */
export interface GatedMixEntry {
  tier: number
  weightBp: number
  signature: boolean
  /** The entry's `minCharge` when its cells are dynamite-gated, else null. */
  minCharge: number | null
}

/** A planet's gate table: bands 1 to 5. */
export type GatedMixBands = readonly (readonly GatedMixEntry[])[]

export interface ChargeSharePayoff {
  planetIndex: number
  band: number
  size: number
  /** Expected dynamite-gated cells of the radius this size frees, before the cap. */
  gatedCells: Money
  valueFreed: Money
  price: Money
  payoff: Money
  /** Whether the 15% guard cut the gated value. */
  isCapped: boolean
}

const BASIS_POINTS = 10000
const ONE_CHARGE = 1
const ONE_UNIT = fromSafeInteger(1)

/** Every planet of the domain, its gate table read through `gateTableOf`. */
export function chargeSharePayoffsOf(
  gateTableOf: (planetIndex: number) => GatedMixBands,
): ChargeSharePayoff[] {
  return PAYOFF_PLANETS.flatMap((planetIndex) =>
    chargeSharePayoffsOnPlanet(planetIndex, gateTableOf(planetIndex)),
  )
}

export function chargeSharePayoffsOnPlanet(
  planetIndex: number,
  bands: GatedMixBands,
): ChargeSharePayoff[] {
  return bands.flatMap((entries, at) =>
    hasDynamiteGatedCells(entries) ? bandPayoffsOf(planetIndex, at + 1, entries) : [],
  )
}

function bandPayoffsOf(
  planetIndex: number,
  band: number,
  entries: readonly GatedMixEntry[],
): ChargeSharePayoff[] {
  const top = Math.min(band, largestSizeOn(planetIndex))
  return chargeSizesUpTo(top).map((size) => chargeSharePayoffOf(planetIndex, band, entries, size))
}

export function chargeSharePayoffOf(
  planetIndex: number,
  band: number,
  entries: readonly GatedMixEntry[],
  size: number,
): ChargeSharePayoff {
  const radiusCells = fromSafeInteger(inRadiusCount(chargeRadiusMm(size)))
  const freed = entries.filter((entry) => isFreedBy(entry, size))
  const share = cappedValueShareOf(leadValueShareOf(planetIndex, band, freed, entries))
  const valueFreed = mul(mul(radiusCells, share.share), bandCellWorthOf(planetIndex, band, entries))
  const price = chargePrice(size, ONE_CHARGE, planetIndex)
  return {
    planetIndex,
    band,
    size,
    gatedCells: mul(radiusCells, cellShareOf(freed, entries)),
    valueFreed,
    price,
    payoff: div(valueFreed, price),
    isCapped: share.isCapped,
  }
}

export function hasDynamiteGatedCells(entries: readonly GatedMixEntry[]): boolean {
  return entries.some((entry) => entry.minCharge !== null)
}

function isFreedBy(entry: GatedMixEntry, size: number): boolean {
  return entry.minCharge !== null && entry.minCharge <= size
}

/** The share of the band's expected ore value the `part` entries hold. */
function leadValueShareOf(
  planetIndex: number,
  band: number,
  part: readonly GatedMixEntry[],
  entries: readonly GatedMixEntry[],
): Money {
  return div(weightedValueOf(planetIndex, band, part), weightedValueOf(planetIndex, band, entries))
}

/** The gated value share, cut to #142's 15% guard when over it. */
function cappedValueShareOf(gatedShare: Money): { share: Money; isCapped: boolean } {
  const capShare = div(fromSafeInteger(GATED_VALUE_SHARE_CAP_BP), fromSafeInteger(BASIS_POINTS))
  const isCapped = cmp(gatedShare, capShare) > 0
  return { share: isCapped ? capShare : gatedShare, isCapped }
}

/** A band cell's expected worth: its mean lead multiple of one unit of the band's ore. */
function bandCellWorthOf(
  planetIndex: number,
  band: number,
  entries: readonly GatedMixEntry[],
): Money {
  return mul(meanLeadMultipleOf(planetIndex, band, entries), bandOreUnitOf(planetIndex, band))
}

/** A band cell's expected worth in band-ore units: the weights at `1.5^lead`, over all weights. */
function meanLeadMultipleOf(
  planetIndex: number,
  band: number,
  entries: readonly GatedMixEntry[],
): Money {
  return div(weightedValueOf(planetIndex, band, entries), totalWeightOf(entries))
}

function cellShareOf(part: readonly GatedMixEntry[], entries: readonly GatedMixEntry[]): Money {
  return div(totalWeightOf(part), totalWeightOf(entries))
}

/** Σ weight × `1.5^lead`, the lead read from the entry's sale tier against the band's. */
function weightedValueOf(
  planetIndex: number,
  band: number,
  entries: readonly GatedMixEntry[],
): Money {
  const bandValue = oreValue(oreTier(planetIndex, band))
  return entries.reduce(
    (sum, entry) =>
      add(sum, mul(fromSafeInteger(entry.weightBp), div(oreValue(saleTierOf(entry)), bandValue))),
    ZERO_MONEY,
  )
}

function totalWeightOf(entries: readonly GatedMixEntry[]): Money {
  return fromSafeInteger(entries.reduce((sum, entry) => sum + entry.weightBp, 0))
}

function saleTierOf(entry: GatedMixEntry): number {
  return entry.signature ? signatureSaleTier(entry.tier) : entry.tier
}

/** One unit of the band's ore at `bandOreWorth`, worth and pace of the planet. */
function bandOreUnitOf(planetIndex: number, band: number): Money {
  return bandOreWorth({ band, oreUnits: ONE_UNIT }, planetIndex)
}
