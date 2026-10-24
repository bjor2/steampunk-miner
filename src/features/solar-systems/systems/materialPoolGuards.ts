/**
 * The lock's guards on a system's generated material pools (ticket 777, spec #774; the GD lock of
 * 23 Oct 2026 on Campaign Scaling with its HS and VS input). Each names the planet and what it misses:
 *
 * - about 15 kinds: at least `kindsTarget`, never past the 17-kind cap;
 * - scarce near the surface: band 1 holds no rare kind and the fewest kinds of any band;
 * - an uncommon ore within the first trip's reach: an uncommon kind live in band 1;
 * - rares only at d >= 0.35: no rare, epic or mythic kind above band 3;
 * - gems: `gemCount` of them, rare or rarer, in bands 3 to 5, in clusters of 1 to 3 cells, selling
 *   at the planet's gem tiers cheapest first, their paper share of the pool value under the cap;
 * - a new family on every planet of system 2 (the roster's slot), an ore family carried by a kind;
 * - every kind its own look and name within its planet, every pair its own within the system, and no
 *   kind a recolour of a first-system species (`poolRecolour.ts`).
 */
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { readIndexText } from '../../../systems/starMap/planetAddress'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import {
  DEEP_RARE_FIRST_BAND,
  RARE_CLUSTER_FIRST_LEAD,
  RARE_CLUSTER_SIZE_SHARES_PERCENT,
} from '../../../systems/world/planetTable'
import { ECONOMY_ROW_RULES } from './economyRules'
import type { MaterialPool, PoolKind } from './materialPool'
import { MATERIAL_POOL_RULES, type MaterialPoolRules } from './materialPoolRules'
import { FIRST_DRAWN_SYSTEM } from './newContentSlots'
import { pairKeyOf } from './poolKindLooks'
import { recolouredKindProblemsOf } from './poolRecolour'

const SURFACE_BAND = 1
const UNCOMMON_LEAD = 1
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
const LOOK_FIELDS = ['silhouette', 'pattern', 'hueSlot', 'id', 'name'] as const

/** Why the pools break the lock; empty when they hold it. */
export function materialPoolProblemsOf(
  pools: readonly MaterialPool[],
  rules: MaterialPoolRules = MATERIAL_POOL_RULES,
): string[] {
  return [
    ...pools.flatMap((pool) => planetPoolProblemsOf(pool, rules)),
    ...repeatedPairProblemsOf(pools),
    ...recolouredKindProblemsOf(pools),
  ]
}

function planetPoolProblemsOf(pool: MaterialPool, rules: MaterialPoolRules): string[] {
  return [
    ...kindCountProblems(pool, rules),
    ...surfaceProblems(pool),
    ...deepRareProblems(pool),
    ...gemProblems(pool, rules),
    ...newFamilyProblems(pool),
    ...ownLookProblems(pool),
  ]
}

function kindCountProblems(pool: MaterialPool, rules: MaterialPoolRules): string[] {
  const count = pool.kinds.length
  if (count >= rules.kindsTarget && count <= rules.kindsCap) return []
  return [`${pool.id} holds ${count} kinds, not ${rules.kindsTarget} to ${rules.kindsCap}`]
}

function surfaceProblems(pool: MaterialPool): string[] {
  const surface = liveKindsIn(pool, SURFACE_BAND)
  const fewest = Math.min(...BANDS.map((band) => liveKindsIn(pool, band).length))
  return [
    ...(surface.some((kind) => kind.lead >= RARE_CLUSTER_FIRST_LEAD)
      ? [`${pool.id} holds a rare kind in band 1`]
      : []),
    ...(surface.length > fewest ? [`${pool.id} holds more kinds in band 1 than deeper`] : []),
    ...(surface.some((kind) => kind.lead === UNCOMMON_LEAD)
      ? []
      : [`${pool.id} holds no uncommon kind within the first trip's reach (band 1)`]),
  ]
}

function deepRareProblems(pool: MaterialPool): string[] {
  return pool.kinds
    .filter((kind) => kind.lead >= RARE_CLUSTER_FIRST_LEAD && kind.window[0] < DEEP_RARE_FIRST_BAND)
    .map((kind) => `${kind.id} is ${kind.rarity} above band ${DEEP_RARE_FIRST_BAND} (d < 0.35)`)
}

function gemProblems(pool: MaterialPool, rules: MaterialPoolRules): string[] {
  const gems = pool.kinds.filter((kind) => kind.gemSaleTier !== null)
  return [
    ...(gems.length === rules.gemCount
      ? []
      : [`${pool.id} sells ${gems.length} gems, not ${rules.gemCount}`]),
    ...gems.flatMap(gemKindProblems),
    ...gemTierProblems(pool, gems),
    ...(pool.gemValueShareBp <= ECONOMY_ROW_RULES.gemShareCapBp
      ? []
      : [`${pool.id}'s gems are ${pool.gemValueShareBp} bp of its value, over the cap`]),
  ]
}

function gemKindProblems(gem: PoolKind): string[] {
  const isDeep = gem.window[0] >= DEEP_RARE_FIRST_BAND && gem.window[1] <= BAND_COUNT
  const cells = gem.clusterCells
  const isClustered = cells?.[0] === 1 && cells[1] === RARE_CLUSTER_SIZE_SHARES_PERCENT.length
  return [
    ...(gem.lead >= RARE_CLUSTER_FIRST_LEAD ? [] : [`gem ${gem.id} is not rare or rarer`]),
    ...(isDeep ? [] : [`gem ${gem.id} lives outside bands ${DEEP_RARE_FIRST_BAND} to 5`]),
    ...(isClustered ? [] : [`gem ${gem.id} does not grow in clusters of 1 to 3 cells`]),
  ]
}

/** The gems sell at the planet's gem tiers, cheapest first, in kind order. */
function gemTierProblems(pool: MaterialPool, gems: readonly PoolKind[]): string[] {
  const planetIndex = planetIndexOfCampaign(readIndexText(pool.campaignIndex) ?? 0n)
  const tiers = gems.map((gem) => gem.gemSaleTier)
  const expected = gemSaleTiersOfPlanet(planetIndex).slice(0, gems.length)
  return tiers.join(',') === expected.join(',')
    ? []
    : [`${pool.id}'s gems sell at ${tiers.join('/')}, not the planet's ${expected.join('/')}`]
}

function newFamilyProblems(pool: MaterialPool): string[] {
  const family = pool.newFamily
  if (family === null) {
    return readIndexText(pool.planet.system) === FIRST_DRAWN_SYSTEM
      ? [`${pool.id} has no new enemy, hazard or ore family`]
      : []
  }
  const isCarried = pool.kinds.some((kind) => kind.newFamily === family.id)
  return family.kind !== 'ore_family' || isCarried
    ? []
    : [`${pool.id}'s new ore family ${family.id} is carried by no kind`]
}

function ownLookProblems(pool: MaterialPool): string[] {
  return LOOK_FIELDS.flatMap((field) =>
    repeatsOf(pool.kinds.map((kind) => kind[field])).map(
      (value) => `${pool.id} holds two kinds with ${field} ${value}`,
    ),
  )
}

function repeatedPairProblemsOf(pools: readonly MaterialPool[]): string[] {
  const pairs = pools.flatMap((pool) =>
    pool.kinds.map((kind) => pairKeyOf(kind.silhouette, kind.pattern)),
  )
  return repeatsOf(pairs).map((pair) => `two kinds of the system wear ${pair}`)
}

function liveKindsIn(pool: MaterialPool, band: number): PoolKind[] {
  return pool.kinds.filter((kind) => kind.window[0] <= band && band <= kind.window[1])
}

function repeatsOf(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, at) => values.indexOf(value) !== at))]
}
