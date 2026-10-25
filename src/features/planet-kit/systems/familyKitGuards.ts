/**
 * The cross-row rules of the generator rows (ticket 824; TD final on Q1, HS conditions 1 and 4,
 * GD Q2 = (b) and Q3):
 *
 * - **Coverage.** Every hazard or family id a planet can carry (the first system's hazard kinds and
 *   the roster's new families) has exactly one kit row, an item or an explicit none; every gap and
 *   every stray row is listed, so a new roster family fails the load until its row is written.
 * - **No repeats.** An item sits on at most one row, and every authored item hooked on a hazard sits
 *   on that hazard's row, under its home merchant's variant: the P1-P5 kits are in the table.
 * - **No recolour.** A row's item is an authored kit item hooked on that row's own family, so no
 *   family sells another planet's kit under a new name, and no generated kit mints a stats id.
 * - **Variants and premium.** A row names a merchant variant the authored merchants carry (each
 *   merchant's name ends in its own variant, and no two share one); a premium rule picks from
 *   common and mid kinds only, rare gems never (the GD on Q3).
 */
import { isSamePlanet } from './planetKitSales'
import type { FamilyKitRow, FamilyKits, KitItem, MerchantRow, PremiumRule } from './planetKitTypes'

/** The GD's Q3 ruling: the premium species comes from the planet's common and mid kinds. */
const PREMIUM_RARITIES: readonly string[] = ['common', 'uncommon']

/** Every way the generator rows break the kit rules; empty when they keep them. */
export function familyKitProblems(
  familyKits: FamilyKits,
  merchants: readonly MerchantRow[],
  items: readonly KitItem[],
  kitFamilyIds: readonly string[],
): string[] {
  return [
    ...merchantVariantProblems(merchants),
    ...coverageProblems(familyKits.rows, kitFamilyIds),
    ...familyKits.rows.flatMap((row) => rowVariantProblems(row, merchants)),
    ...premiumRuleProblems([familyKits.noFamily.premiumRule, ...rulesOf(familyKits.rows)]),
    ...repeatedItemProblems(familyKits.rows),
    ...familyKits.rows.flatMap((row) => rowItemProblems(row, items)),
    ...items.flatMap((item) => missingItemRowProblems(item, familyKits.rows, merchants)),
  ]
}

function merchantVariantProblems(merchants: readonly MerchantRow[]): string[] {
  return [
    ...merchants
      .filter((merchant) => !endsWithWord(merchant.name, merchant.variant))
      .map(
        (merchant) => `${merchant.name}: the name does not end in its variant ${merchant.variant}`,
      ),
    ...duplicatesOf(merchants.map((merchant) => merchant.variant)).map(
      (variant) => `merchant variant ${variant} is on more than one merchant`,
    ),
  ]
}

/** One row per id a planet can carry; the gaps and the strays listed in full. */
function coverageProblems(
  rows: readonly FamilyKitRow[],
  kitFamilyIds: readonly string[],
): string[] {
  const covered = rows.map((row) => row.familyId)
  return [
    ...kitFamilyIds
      .filter((id) => !covered.includes(id))
      .map((id) => `family ${id} has no kit row: give it an item or itemId null`),
    ...covered
      .filter((id) => !kitFamilyIds.includes(id))
      .map((id) => `familyKits row ${id} is no hazard or family a planet can carry`),
    ...duplicatesOf(covered).map((id) => `family ${id} has more than one kit row`),
  ]
}

function rowVariantProblems(row: FamilyKitRow, merchants: readonly MerchantRow[]): string[] {
  return merchants.some((merchant) => merchant.variant === row.merchantVariant)
    ? []
    : [`${row.familyId}: no merchant carries the variant ${row.merchantVariant}`]
}

function premiumRuleProblems(rules: readonly PremiumRule[]): string[] {
  return uniqueRulesOf(rules).flatMap((rule) =>
    rule.rarities
      .filter((rarity) => !PREMIUM_RARITIES.includes(rarity))
      .map((rarity) => `premium rule ${rule.id} picks ${rarity}: only common and mid kinds`),
  )
}

function repeatedItemProblems(rows: readonly FamilyKitRow[]): string[] {
  const itemIds = rows.flatMap((row) => (row.itemId === null ? [] : [row.itemId]))
  return duplicatesOf(itemIds).map((id) => `kit item ${id} is on more than one family's row`)
}

/** The row's item is authored and hooked on the row's own family, never another's kit renamed. */
function rowItemProblems(row: FamilyKitRow, items: readonly KitItem[]): string[] {
  if (row.itemId === null) return []
  const item = items.find((candidate) => candidate.id === row.itemId)
  if (item === undefined) return [`${row.familyId}: ${row.itemId} is no authored kit item`]
  return item.effect.hazard === row.familyId
    ? []
    : [`${row.familyId}: ${item.id} hooks ${item.effect.hazard}, not this family`]
}

/** An item hooked on a hazard sits on that hazard's row, under its home merchant's variant. */
function missingItemRowProblems(
  item: KitItem,
  rows: readonly FamilyKitRow[],
  merchants: readonly MerchantRow[],
): string[] {
  if (item.effect.hazard === null) return []
  const row = rows.find((candidate) => candidate.familyId === item.effect.hazard)
  if (row === undefined || row.itemId !== item.id)
    return [`${item.id}: not on the kit row of its hazard ${item.effect.hazard}`]
  const home = merchants.find((merchant) => isSamePlanet(merchant.planet, item.homePlanet))
  return home === undefined || home.variant === row.merchantVariant
    ? []
    : [
        `${item.effect.hazard}: variant ${row.merchantVariant}; ${item.id}'s home is ${home.variant}`,
      ]
}

function rulesOf(rows: readonly FamilyKitRow[]): PremiumRule[] {
  return rows.map((row) => row.premiumRule)
}

function uniqueRulesOf(rules: readonly PremiumRule[]): PremiumRule[] {
  return rules.filter((rule, at) => rules.findIndex((other) => other.id === rule.id) === at)
}

function endsWithWord(name: string, variant: string): boolean {
  return name === variant || name.endsWith(` ${variant}`)
}

function duplicatesOf(values: readonly string[]): string[] {
  return values.filter((value, at) => values.indexOf(value) !== at)
}
