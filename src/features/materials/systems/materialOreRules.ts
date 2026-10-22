/**
 * The ore rules span of a species row (ticket 736, GD lock on #736): a row binds its kind slot only
 * on a planet entered under ore rules from `fromOreRules` on, or only under rules before
 * `beforeOreRules`, so a pool can swap the species one slot shows at a rules version while a planet
 * a save holds under older rules keeps the species it was entered with. Under ore rules 9, P2's
 * Cobalt Bloom, Bismuth Stair and Smoke Diamond give way to Azurite Nodule, Pyrite Sun and
 * Argentite on the same slots. A retired row keeps its id, so its `material:<id>` record and its
 * skin stay. Look only: a cell stores the slot, never the species, so no cell, tier or price moves.
 */
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'

/** The first ore rules a stamp can carry a species pool under: rules 1 was the rarity rows alone. */
const FIRST_SPAN_ORE_RULES = 2

type Raw = Record<string, unknown>

/** The ore rules a species row binds under: from `fromOreRules` (or always) to before `beforeOreRules`. */
export interface OreRulesSpan {
  fromOreRules?: number
  beforeOreRules?: number
}

/** Whether the row binds its slot on a planet entered under ore rules `oreRulesVersion`. */
export function isSpeciesBoundUnder(
  span: OreRulesSpan,
  oreRulesVersion: number | undefined,
): boolean {
  const rules = oreRulesVersion ?? 0
  return rules >= (span.fromOreRules ?? 0) && rules < (span.beforeOreRules ?? Infinity)
}

/** Why a row's span fields are not ore rules versions this build knows, or bind under none. */
export function oreRulesSpanProblems(row: Raw, where: string): string[] {
  const fieldProblems = (['fromOreRules', 'beforeOreRules'] as const)
    .filter((field) => row[field] !== undefined && !isKnownOreRules(row[field]))
    .map(
      (field) =>
        `${where}.${field} must be an ore rules version from ${FIRST_SPAN_ORE_RULES} to ${ORE_RULES_VERSION}`,
    )
  if (fieldProblems.length > 0) return fieldProblems
  return isEmptySpan(row)
    ? [`${where} binds under no ore rules: fromOreRules is not before beforeOreRules`]
    : []
}

/**
 * A kind slot holds one species under any one ore rules version, so the roster's `(pool, slot)`
 * lookup is never ambiguous: two rows of one pool and slot must bind under rules apart.
 */
export function sharedSlotProblems(rows: readonly Raw[]): string[] {
  return rows.flatMap((row, at) => {
    const holder = rows.slice(0, at).find((earlier) => isSameSlotUnderSameRules(earlier, row))
    if (holder === undefined) return []
    return [
      `${String(row.id)} binds the kind slot ${String(row.slot)} that ${String(holder.id)} already holds`,
    ]
  })
}

function isSameSlotUnderSameRules(a: Raw, b: Raw): boolean {
  return a.pool === b.pool && a.slot === b.slot && isOverlapping(spanOf(a), spanOf(b))
}

function isOverlapping(a: OreRulesSpan, b: OreRulesSpan): boolean {
  const aFrom = a.fromOreRules ?? 0
  const bFrom = b.fromOreRules ?? 0
  return aFrom < (b.beforeOreRules ?? Infinity) && bFrom < (a.beforeOreRules ?? Infinity)
}

function spanOf(row: Raw): OreRulesSpan {
  const isWhole = (value: unknown) => Number.isSafeInteger(value)
  return {
    fromOreRules: isWhole(row.fromOreRules) ? (row.fromOreRules as number) : undefined,
    beforeOreRules: isWhole(row.beforeOreRules) ? (row.beforeOreRules as number) : undefined,
  }
}

function isEmptySpan(row: Raw): boolean {
  const { fromOreRules, beforeOreRules } = spanOf(row)
  if (fromOreRules === undefined || beforeOreRules === undefined) return false
  return fromOreRules >= beforeOreRules
}

function isKnownOreRules(rules: unknown): boolean {
  return (
    Number.isSafeInteger(rules) &&
    (rules as number) >= FIRST_SPAN_ORE_RULES &&
    (rules as number) <= ORE_RULES_VERSION
  )
}
