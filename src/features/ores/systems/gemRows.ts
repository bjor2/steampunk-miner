/**
 * Each planet's gem tier (ticket 713, Systems' decision on #713 with Bjor's OK of 23 Oct; ticket 741,
 * Systems' final spec on #741): a pool names the three kind slots that are its gems, cheapest first,
 * and the k-th sells at an integer tier of its own,
 *
 *   t_g(p, k) = t_top(p) + Δ_k        t_top(p) = oreTier(p, 5) + the planet's top rarity lead
 *
 * with the one ladder Δ = 5, 6 and 8 fixed from P1's Diamond, Emerald and Ruby (tiers 12, 13 and
 * 15). Only the sale tier maps (the TD's signature-tier pattern): the cell keeps its own tier for
 * hardness, grade and look. A pool's gems join from an ore rules version on, so a planet a save holds
 * under older rules sells its kinds as before. The tiers themselves are `gemTiers.ts`'s formula.
 * Vertical. Integer only.
 */
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'

export interface GemRows {
  /** Δ_k: the tiers above the planet's top ore tier the k-th gem sells at, cheapest first. */
  tierLeads: readonly number[]
  pools: readonly GemPool[]
}

/** One pool's gems: its kind slots, cheapest first, from the ore rules that made them gems. */
export interface GemPool {
  pool: string
  fromOreRules: number
  slotIds: readonly string[]
}

/** What the guards check a gem pool against: the registry's pools and the kind slots. */
export interface GemRowContext {
  poolIds: readonly string[]
  slots: readonly GemSlotFacts[]
  /** The rarity tier ids a gem may wear: rare and every tier above it. */
  gemTierIds: readonly string[]
}

/** A kind slot as the gem guards read it. */
export interface GemSlotFacts {
  slotId: string
  rarity: string
  /** The pool that owns the slot; absent on a shared slot. */
  pool?: string
}

type Raw = Record<string, unknown>

/** Why the `gems` block is not a lead ladder and a list of pools' gems; empty when it is. */
export function gemRowProblems(gems: unknown, context: GemRowContext): string[] {
  const raw = (gems ?? {}) as Raw
  const leads = raw.tierLeads
  if (!isRisingLadder(leads)) return ['ore.gems.tierLeads must be whole numbers from 1, rising']
  if (!Array.isArray(raw.pools)) return ['ore.gems.pools must be a list of gem pools']
  const pools = raw.pools as Raw[]
  return [
    ...pools.flatMap((pool, at) => gemPoolProblems(pool, `ore.gems.pools[${at}]`, leads, context)),
    ...repeatedPoolsOf(pools).map((pool) => `ore.gems.pools names pool "${pool}" twice`),
  ]
}

/** The block as typed rows; call only on a block `gemRowProblems` accepts. */
export function gemRowsOf(gems: Raw): GemRows {
  return {
    tierLeads: gems.tierLeads as number[],
    pools: (gems.pools as Raw[]).map((pool) => ({
      pool: pool.pool as string,
      fromOreRules: pool.fromOreRules as number,
      slotIds: pool.slots as string[],
    })),
  }
}

/**
 * Δ of the slot on a planet resolving to `pool` under ore rules `oreRulesVersion`: its gem's lead
 * when the pool's gems hold under those rules, null for any other kind.
 */
export function gemTierLeadOf(
  rows: GemRows,
  pool: string | null,
  slotId: string,
  oreRulesVersion: number | undefined,
): number | null {
  const gems = rows.pools.find((row) => row.pool === pool)
  if (gems === undefined || (oreRulesVersion ?? 0) < gems.fromOreRules) return null
  const rank = gems.slotIds.indexOf(slotId)
  return rank < 0 ? null : rows.tierLeads[rank]
}

function gemPoolProblems(
  pool: Raw,
  where: string,
  leads: readonly number[],
  context: GemRowContext,
): string[] {
  const slots = Array.isArray(pool.slots) ? (pool.slots as unknown[]) : []
  const isRanked = Array.isArray(pool.slots) && slots.length === leads.length
  return [
    ...(context.poolIds.includes(pool.pool as string) ? [] : [`${where}.pool must name a pool`]),
    ...(isKnownOreRules(pool.fromOreRules)
      ? []
      : [`${where}.fromOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`]),
    ...(isRanked ? [] : [`${where}.slots must name ${leads.length} kind slots, cheapest first`]),
    ...slots.flatMap((slotId, at) =>
      gemSlotProblems(slotId, pool.pool, `${where}.slots[${at}]`, context),
    ),
    ...(isOneTable(slots) ? [] : [`${where}.slots must come from one kind table`]),
    ...(new Set(slots).size === slots.length ? [] : [`${where}.slots names a slot twice`]),
  ]
}

/** A gem is a slot of the kinds tables, shared or the pool's own, of rare or a rarer tier. */
function gemSlotProblems(
  slotId: unknown,
  pool: unknown,
  where: string,
  context: GemRowContext,
): string[] {
  const slot = context.slots.find((candidate) => candidate.slotId === slotId)
  if (slot === undefined) return [`${where} must name a kind slot`]
  return [
    ...(slot.pool === undefined || slot.pool === pool ? [] : [`${where} is another pool's slot`]),
    ...(context.gemTierIds.includes(slot.rarity) ? [] : [`${where} must be rare or rarer`]),
  ]
}

function isOneTable(slots: readonly unknown[]): boolean {
  return new Set(slots.map((slotId) => String(slotId).split('.')[0])).size <= 1
}

function repeatedPoolsOf(pools: readonly Raw[]): string[] {
  const ids = pools.map((pool) => String(pool.pool))
  return [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
}

function isRisingLadder(leads: unknown): leads is number[] {
  if (!Array.isArray(leads) || leads.length === 0) return false
  return leads.every((lead, at) => isWholeFromOne(lead) && (at === 0 || lead > leads[at - 1]))
}

function isKnownOreRules(rules: unknown): boolean {
  return (
    Number.isSafeInteger(rules) && (rules as number) > 1 && (rules as number) <= ORE_RULES_VERSION
  )
}

function isWholeFromOne(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 1
}
