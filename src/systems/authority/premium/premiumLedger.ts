/**
 * The premium ledger (ticket 844; the TD ruling on #821, comment 6388180827, as amended by
 * 6388185794, and Systems' crate rule 6388171635): per player, how many of the hold's units are a
 * planet's premium species, keyed by where they were mined, `(originS, originP, speciesId)`. Counts
 * only, never a price: the lift is set at the sale, and only the origin's merchant pays it, so no
 * g is stored. The ledger is never cleared on departure.
 *
 * Each count sits under the hold tier its units were stored at, since the invariant and every
 * debit read one tier: for each tier the counts sum to at most the hold's units of that tier.
 * Debits and moves take units in ascending `(originS, originP, speciesId)` order within the tier.
 *
 * Counts are bigint, written as canonical decimal text so the state, the digest and a save stay
 * JSON. Entries are kept sorted by tier then key, so one ledger has one shape.
 */
import { readIndexText } from '../../starMap/planetAddress'
import type { Cargo } from '../../vehicle/vehicleState'

export interface PremiumCount {
  /** The hold tier the units are stored at. */
  tier: number
  /** The planet the units were mined on, its stable id `s:p` (#790). */
  origin: string
  speciesId: string
  /** A whole count from 1, as canonical decimal text. */
  units: string
}

export type PremiumLedger = readonly PremiumCount[]

export const EMPTY_PREMIUM_LEDGER: PremiumLedger = []

/** Where a premium unit came from and the tier it is kept at. */
export type PremiumKey = Omit<PremiumCount, 'units'>

/** What a take moved out of the ledger, and what it left. */
export interface PremiumTake {
  taken: PremiumLedger
  left: PremiumLedger
}

/** The ledger with one more unit under `key`. */
export function withPremiumUnit(ledger: PremiumLedger, key: PremiumKey): PremiumLedger {
  return withPremiumCounts(ledger, [{ ...key, units: '1' }])
}

/** The ledger with each of `counts` added under its key. */
export function withPremiumCounts(ledger: PremiumLedger, counts: PremiumLedger): PremiumLedger {
  return counts.reduce(addCount, ledger)
}

/** Up to `units` of the tier's counts, taken in ascending key order. */
export function takePremiumOfTier(ledger: PremiumLedger, tier: number, units: bigint): PremiumTake {
  const { taken, left } = ledger.reduce<PremiumTake & { room: bigint }>(
    (take, count) => takeFromCount(take, count, count.tier === tier ? take.room : 0n),
    { taken: [], left: [], room: units },
  )
  return { taken, left }
}

/** Every count of the given tiers taken out. */
export function takePremiumOfTiers(ledger: PremiumLedger, tiers: readonly number[]): PremiumTake {
  return {
    taken: ledger.filter((count) => tiers.includes(count.tier)),
    left: ledger.filter((count) => !tiers.includes(count.tier)),
  }
}

/** The units the tier's counts add up to. */
export function premiumUnitsOfTier(ledger: PremiumLedger, tier: number): bigint {
  return sumOf(ledger.filter((count) => count.tier === tier))
}

/** The tier's counts mined on `origin`. */
export function premiumCountsFrom(
  ledger: PremiumLedger,
  tier: number,
  origin: string,
): PremiumLedger {
  return ledger.filter((count) => count.tier === tier && count.origin === origin)
}

/** The units a list of counts adds up to. */
export function sumOf(counts: PremiumLedger): bigint {
  return counts.reduce((total, count) => total + BigInt(count.units), 0n)
}

/**
 * The invariant (TD amendment 6388185794): each tier's counts are at most the hold's units of that
 * tier. Every broken tier is listed.
 */
export function premiumOverHoldProblems(
  ledger: PremiumLedger,
  hold: Cargo,
  where: string,
): string[] {
  return [...new Set(ledger.map((count) => count.tier))]
    .filter((tier) => premiumUnitsOfTier(ledger, tier) > BigInt(hold.ore[String(tier)] ?? 0))
    .map((tier) => `${where}: tier ${tier} counts more premium units than the hold holds`)
}

/** Whether `units` is a count a ledger stores: canonical decimal text from 1. */
export function isPremiumUnitsText(units: unknown): units is string {
  return readIndexText(units) !== null
}

/** Whether `origin` is a planet's stable id `s:p`, both canonical index text. */
export function isPlanetKeyText(origin: unknown): origin is string {
  if (typeof origin !== 'string') return false
  const parts = origin.split(':')
  return parts.length === 2 && parts.every((part) => readIndexText(part) !== null)
}

/** Ascending tier, then origin system, origin planet and species id. */
export function comparePremiumKeys(a: PremiumKey, b: PremiumKey): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  return compareOrigins(a.origin, b.origin) || compareText(a.speciesId, b.speciesId)
}

function addCount(ledger: PremiumLedger, added: PremiumCount): PremiumLedger {
  const held = ledger.find((count) => comparePremiumKeys(count, added) === 0)
  const units = BigInt(added.units) + (held === undefined ? 0n : BigInt(held.units))
  const others = ledger.filter((count) => count !== held)
  return [...others, { ...added, units: units.toString() }].sort(comparePremiumKeys)
}

function takeFromCount(
  take: PremiumTake & { room: bigint },
  count: PremiumCount,
  room: bigint,
): PremiumTake & { room: bigint } {
  const held = BigInt(count.units)
  const moved = held < room ? held : room
  return {
    taken: moved > 0n ? [...take.taken, { ...count, units: moved.toString() }] : take.taken,
    left: held > moved ? [...take.left, { ...count, units: (held - moved).toString() }] : take.left,
    room: take.room - moved,
  }
}

function compareOrigins(a: string, b: string): number {
  const [systemA, planetA] = a.split(':').map(BigInt)
  const [systemB, planetB] = b.split(':').map(BigInt)
  return compareBig(systemA, systemB) || compareBig(planetA, planetB)
}

function compareBig(a: bigint, b: bigint): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function compareText(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
