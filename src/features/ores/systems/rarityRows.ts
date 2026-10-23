/**
 * The rarity block of `ores.economy.json` (Systems on #139, comment 6202970624 section 6, with the
 * Scaler conditions of 6203133480 and the bounds of 6203159815; ticket 445), read once and refused
 * whole when broken. Vertical: rarity is a tier offset, never a new curve.
 *
 * - `tiers`: common, uncommon, rare, epic and mythic as tier offsets 0 to 4. A cell of offset `k`
 *   sells at `oreSalePrice(t_b + k)` and is as hard as `H(t_b + k)`. `mult` is stored only so a
 *   golden can hold it to `valueRatio^k`; code derives the multiplier.
 * - `meanPpmByBand`: today's mean value of one ore unit of band `b` in ppm of `V(t_b)`, lead rows and
 *   signature included. The `mixed` weights are solved against it (`raritySolve.ts`).
 * - `weightsBpByBand`: basis points of a band's ore cells per non-common tier. `legacy` is today's
 *   `leadWeightsBpByBand` verbatim (P1, P2 and every planet a save holds without `oreRulesVersion`);
 *   `mixed` is Systems' solved table for new planets from P3. `deep` is the mixed table with rare,
 *   epic and mythic moved to band 3 on (ticket 738, `rarityRowSets.ts`): it never draws them above
 *   band 3. The common share is derived.
 * - `tripClampShareBp` and `tripClampTierIds`: epic and mythic finds pay in full only while their
 *   value in the trip stays within 15% of a full hold of the band's ore (`rarityTripClamp.ts`).
 *
 * The block has no `gateClass`: gate class comes from the family alone (#142), so rarity never
 * gates drilling or travel.
 */
import { fromCanonical, isMoneyText, type Money } from '../../../systems/money'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { DEEP_RARE_FIRST_BAND, RARE_CLUSTER_FIRST_LEAD } from '../../../systems/world/planetTable'

export type RarityRowSet = 'legacy' | 'mixed' | 'deep'

export interface RarityTier {
  id: string
  /** Tiers above the band's own ore tier: 0 for common. */
  tierOffset: number
  /** `valueRatio^tierOffset` as Systems wrote it, a decimal string; code never reads it. */
  multText: string
  /** The first band of the planet the tier is drawn in. */
  firstBand: number
  /** The first planet the tier is drawn on. */
  firstPlanet: number
}

export interface RarityRows {
  /** `w_k = c_b * m_k^-alpha`: the spawn weight falls with the square of the value multiplier. */
  alpha: number
  /** Ordered by tier offset, common first. */
  tiers: readonly RarityTier[]
  /** Bands 1 to 5. */
  meanPpmByBand: readonly number[]
  /** Per row set, per non-common tier id, bands 1 to 5. */
  weightsBpByBand: Readonly<Record<RarityRowSet, Readonly<Record<string, readonly number[]>>>>
  meanToleranceBp: Money
  tripClampShareBp: number
  tripClampTierIds: readonly string[]
}

export const RARITY_ROW_SETS: readonly RarityRowSet[] = ['legacy', 'mixed', 'deep']

const BASIS_POINTS = 10000
const PPM = 1000000
const TIER_ID = /^[a-z]+$/

type Raw = Record<string, unknown>

/** Why `ore.rarity` is not Systems' block; empty when it is. */
export function rarityRowProblems(rarity: unknown): string[] {
  const raw = (rarity ?? {}) as Raw
  const tiers = Array.isArray(raw.tiers) ? (raw.tiers as Raw[]) : []
  return [
    ...(isWhole(raw.alpha, 1) ? [] : ['ore.rarity.alpha must be a whole number from 1']),
    ...tierListProblems(raw.tiers),
    ...meanProblems(raw.meanPpmByBand),
    ...RARITY_ROW_SETS.flatMap((set) => weightSetProblems(raw.weightsBpByBand, set, tiers)),
    ...(isMoneyText(raw.meanToleranceBp) ? [] : ['ore.rarity.meanToleranceBp must be a decimal']),
    ...clampProblems(raw, tiers),
  ]
}

/** The block as typed rows; call only on a block `rarityRowProblems` accepts. */
export function rarityRowsOf(rarity: Raw): RarityRows {
  const tiers = rarity.tiers as Raw[]
  return {
    alpha: rarity.alpha as number,
    tiers: tiers.map((tier) => ({
      id: tier.id as string,
      tierOffset: tier.tierOffset as number,
      multText: tier.mult as string,
      firstBand: tier.firstBand as number,
      firstPlanet: tier.firstPlanet as number,
    })),
    meanPpmByBand: rarity.meanPpmByBand as number[],
    weightsBpByBand: rarity.weightsBpByBand as RarityRows['weightsBpByBand'],
    meanToleranceBp: fromCanonical(rarity.meanToleranceBp as string),
    tripClampShareBp: rarity.tripClampShareBp as number,
    tripClampTierIds: rarity.tripClampTierIds as string[],
  }
}

function tierListProblems(tiers: unknown): string[] {
  if (!Array.isArray(tiers) || tiers.length === 0) return ['ore.rarity.tiers must be a list']
  const rows = tiers as Raw[]
  const ids = rows.map((tier) => String(tier.id))
  return [
    ...rows.flatMap(tierRowProblems),
    ...ids.filter((id, at) => ids.indexOf(id) !== at).map((id) => `rarity tier "${id}" twice`),
    ...(isEverywhereFromStart(rows[0]) ? [] : ['the common tier is drawn from band 1 of planet 1']),
  ]
}

function tierRowProblems(tier: Raw, at: number): string[] {
  const name = `ore.rarity.tiers[${at}]`
  const isBand = isWhole(tier.firstBand, 1) && (tier.firstBand as number) <= BAND_COUNT
  return [
    ...(TIER_ID.test(String(tier.id)) ? [] : [`${name}.id must be lower-case letters`]),
    ...(tier.tierOffset === at ? [] : [`${name}.tierOffset must be ${at}, its place in the list`]),
    ...(isMoneyText(tier.mult) ? [] : [`${name}.mult must be a decimal string`]),
    ...(isBand ? [] : [`${name}.firstBand must be a band from 1 to ${BAND_COUNT}`]),
    ...(isWhole(tier.firstPlanet, 1) ? [] : [`${name}.firstPlanet must be a planet from 1`]),
  ]
}

function isEverywhereFromStart(tier: Raw | undefined): boolean {
  return tier?.firstBand === 1 && tier.firstPlanet === 1
}

function meanProblems(means: unknown): string[] {
  const isRow = Array.isArray(means) && means.length === BAND_COUNT
  return isRow && means.every((mean) => isWhole(mean, PPM))
    ? []
    : [`ore.rarity.meanPpmByBand needs ${BAND_COUNT} means in ppm, each from ${PPM}`]
}

function weightSetProblems(sets: unknown, set: RarityRowSet, tiers: readonly Raw[]): string[] {
  const weights = ((sets ?? {}) as Raw)[set] as Raw | undefined
  const rated = tiers.slice(1)
  const rows = rated.map((tier) => basisPointRow(weights?.[String(tier.id)]))
  const isShaped = Object.keys(weights ?? {}).length === rated.length
  if (!isShaped || rows.some((row) => row === null)) {
    return [`ore.rarity.weightsBpByBand.${set} needs each tier above common: ${BAND_COUNT} bp`]
  }
  const known = rows as number[][]
  return [
    ...overfullBandProblems(set, known),
    ...rated.flatMap((tier, at) => earlyWeightProblems(set, tier, known[at])),
    ...(set === 'legacy' ? rated.flatMap((tier, at) => lateTierProblems(tier, known[at])) : []),
    ...(set === 'deep'
      ? rated.flatMap((tier, at) => shallowRareProblems(tier, at + 1, known[at]))
      : []),
  ]
}

function overfullBandProblems(set: RarityRowSet, rows: readonly number[][]): string[] {
  return Array.from({ length: BAND_COUNT }, (_, at) => at)
    .filter((at) => rows.reduce((sum, row) => sum + row[at], 0) > BASIS_POINTS)
    .map((at) => `band ${at + 1}'s ${set} rarity weights add up to more than ${BASIS_POINTS}`)
}

function earlyWeightProblems(set: RarityRowSet, tier: Raw, row: readonly number[]): string[] {
  const isEarly = row.some((weight, at) => weight > 0 && at + 1 < (tier.firstBand as number))
  return isEarly ? [`the ${set} ${String(tier.id)} weight is drawn above its first band`] : []
}

/** The legacy rows serve P1 and P2, so a tier that starts on a later planet weighs nothing there. */
function lateTierProblems(tier: Raw, row: readonly number[]): string[] {
  const isLate = (tier.firstPlanet as number) > 1 && row.some((weight) => weight > 0)
  return isLate ? [`the legacy ${String(tier.id)} weight must be 0: the tier starts later`] : []
}

/**
 * The deep rows draw rare, epic and mythic only from band 3, `d >= 0.35` (ticket 738); a tier's
 * offset is its place in the list.
 */
function shallowRareProblems(tier: Raw, tierOffset: number, row: readonly number[]): string[] {
  if (tierOffset < RARE_CLUSTER_FIRST_LEAD) return []
  const isShallow = row.some((weight, at) => weight > 0 && at + 1 < DEEP_RARE_FIRST_BAND)
  return isShallow
    ? [`the deep ${String(tier.id)} weight is drawn above band ${DEEP_RARE_FIRST_BAND}`]
    : []
}

function clampProblems(raw: Raw, tiers: readonly Raw[]): string[] {
  const ids = tiers.map((tier) => String(tier.id))
  const clamped = Array.isArray(raw.tripClampTierIds) ? (raw.tripClampTierIds as unknown[]) : null
  const isShare = isWhole(raw.tripClampShareBp, 0) && raw.tripClampShareBp <= BASIS_POINTS
  const isTierList = clamped !== null && clamped.every((id) => ids.includes(String(id)))
  return [
    ...(isShare ? [] : ['ore.rarity.tripClampShareBp must be basis points']),
    ...(isTierList ? [] : ['ore.rarity.tripClampTierIds must name rarity tiers']),
  ]
}

function basisPointRow(row: unknown): number[] | null {
  if (!Array.isArray(row) || row.length !== BAND_COUNT) return null
  return row.every((weight) => isWhole(weight, 0) && weight <= BASIS_POINTS) ? row : null
}

function isWhole(value: unknown, from: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= from
}
