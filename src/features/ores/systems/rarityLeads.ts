/**
 * The rarity leads a planet's ore patches roll (TD ruling on ticket 445, sections 1 and 3): the
 * share of a band's patches at each tier offset, common first, under the planet's row set. The
 * `legacy` set is today's lead rows (+0, +1, +2); the `mixed` set adds epic (+3) and mythic (+4) on
 * planets entered under the ore rules from P3, and the `deep` set draws rare and up only from band 3
 * (ticket 738). Vertical. Integer basis points only.
 */
import type { PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { ORE_ROWS } from './oreRows'
import type { RarityRowSet } from './rarityRows'
import { rarityRowSetOf, rarityTiers, rarityWeightBpOf } from './rarityTiers'

const BASIS_POINTS = 10000
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)

/** The weights the planet these params make draws: its ore rules and index decide (ticket 445). */
export function rarityRowSetOfPlanet(params: PlanetParams): RarityRowSet {
  return rarityRowSetOf(params.planetIndex, params.oreRulesVersion)
}

/** Every lead a patch can roll, common (0) to mythic (+4). */
export function rarityLeads(): readonly number[] {
  return rarityTiers().map((tier) => tier.tierOffset)
}

/** Basis points of band `band`'s patches at each lead, common first; they add up to 10000. */
export function rarityLeadBucketsBpOf(set: RarityRowSet, band: number): readonly number[] {
  const bucket = bucketsBySet()[set][band - 1]
  if (bucket === undefined) throw new RangeError(`band must be 1 to ${BAND_COUNT}, got ${band}`)
  return bucket
}

/** The largest lead the set draws anywhere: +2 on the legacy rows, mythic's +4 on the mixed and deep. */
export function topLeadOf(set: RarityRowSet): number {
  const drawn = rarityLeads().filter((lead) => BANDS.some((band) => isDrawn(set, lead, band)))
  return Math.max(...drawn)
}

function isDrawn(set: RarityRowSet, lead: number, band: number): boolean {
  return rarityLeadBucketsBpOf(set, band)[lead] > 0
}

/** Per row set, bands 1 to 5, the buckets of each band. */
type LeadBuckets = Readonly<Record<RarityRowSet, readonly (readonly number[])[]>>

/** Built on first ask from the loaded rows: every patch asks, so it is never rebuilt. */
let buckets: LeadBuckets | null = null

function bucketsBySet(): LeadBuckets {
  buckets ??= {
    legacy: bandBucketsOf('legacy'),
    mixed: bandBucketsOf('mixed'),
    deep: bandBucketsOf('deep'),
  }
  return buckets
}

function bandBucketsOf(set: RarityRowSet): readonly (readonly number[])[] {
  return BANDS.map((band) => bucketsOf(set, band))
}

function bucketsOf(set: RarityRowSet, band: number): readonly number[] {
  const rated = rarityLeads()
    .slice(1)
    .map((lead) => rarityWeightBpOf(set, lead, band, ORE_ROWS))
  const common = BASIS_POINTS - rated.reduce((sum, weight) => sum + weight, 0)
  return Object.freeze([common, ...rated])
}
