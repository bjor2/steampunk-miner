/**
 * The generator rows of the planet kits (ticket 824, PK5 under spec #647; the TD's final ruling on
 * Q1 with the HS conditions 1-5 and VS rows 1-7, GD Q2 = (b), Q3 per Progression and Systems): the
 * `premiumRules`, `familyKits` and `noFamilyKit` blocks of `planetKits.json`. A family kit row is
 * `{ familyId, merchantVariant, premiumRule, itemId }`, keyed by the hazard or family id a planet
 * carries, so a new family's kit is one data row; `itemId` is null where the family has no authored
 * item (premium only). The row shapes are judged here, every problem listed; the cross-row rules
 * (coverage, no repeats, no recolour) are `familyKitGuards.ts`'s.
 */
import {
  isPlainMap,
  isText,
  isWholeFrom,
  SNAKE_ID,
  unknownFieldProblems,
  type Raw,
} from './planetKitRowShape'
import type { FamilyKitRow, FamilyKits, PremiumRule } from './planetKitTypes'

export const FAMILY_KIT_FILE_FIELDS: readonly string[] = [
  'premiumRules',
  'familyKits',
  'noFamilyKit',
]
const FAMILY_KIT_ROW_FIELDS: readonly string[] = [
  'familyId',
  'merchantVariant',
  'premiumRule',
  'itemId',
]
const NO_FAMILY_ROW_FIELDS: readonly string[] = ['premiumRule', 'itemId']
const PREMIUM_RULE_FIELDS: readonly string[] = ['rarities', 'reachBand']

/** Why the file's generator blocks are not the row shapes; empty when they are. */
export function familyKitShapeProblems(file: Raw): string[] {
  const rules = isPlainMap(file.premiumRules) ? file.premiumRules : {}
  return [
    ...premiumRulesProblems(file.premiumRules),
    ...familyKitListProblems(file.familyKits, rules),
    ...noFamilyKitProblems(file.noFamilyKit, rules),
  ]
}

/** The typed generator rows of a file whose shape is sound. */
export function familyKitsOf(file: Raw): FamilyKits {
  const rules = premiumRulesOf(file.premiumRules as Raw)
  const noFamily = file.noFamilyKit as Raw
  return {
    rows: (file.familyKits as Raw[]).map((row) => familyKitRowOf(row, rules)),
    noFamily: { premiumRule: ruleNamed(rules, noFamily.premiumRule), itemId: null },
  }
}

function premiumRulesOf(raw: Raw): Map<string, PremiumRule> {
  return new Map(
    Object.entries(raw).map(([id, rule]) => {
      const fields = rule as Raw
      return [
        id,
        { id, rarities: fields.rarities as string[], reachBand: fields.reachBand as number },
      ]
    }),
  )
}

function familyKitRowOf(row: Raw, rules: Map<string, PremiumRule>): FamilyKitRow {
  return {
    familyId: row.familyId as string,
    merchantVariant: row.merchantVariant as string,
    premiumRule: ruleNamed(rules, row.premiumRule),
    itemId: row.itemId as string | null,
  }
}

function ruleNamed(rules: Map<string, PremiumRule>, id: unknown): PremiumRule {
  return rules.get(id as string) as PremiumRule
}

function premiumRulesProblems(value: unknown): string[] {
  if (!isPlainMap(value) || Object.keys(value).length === 0)
    return ['premiumRules must be a non-empty map of rule id to { rarities, reachBand }']
  return Object.entries(value).flatMap(([id, rule]) => premiumRuleProblems(id, rule))
}

function premiumRuleProblems(id: string, rule: unknown): string[] {
  const where = `premiumRules.${id}`
  if (!isPlainMap(rule)) return [`${where} must be { rarities, reachBand }`]
  return [
    ...(SNAKE_ID.test(id) ? [] : [`${where}: a rule id is snake_case`]),
    ...(isTextList(rule.rarities) ? [] : [`${where}.rarities must be a non-empty list of text`]),
    ...(isWholeFrom(rule.reachBand, 1) ? [] : [`${where}.reachBand must be a band from 1`]),
    ...unknownFieldProblems(rule, where, PREMIUM_RULE_FIELDS),
  ]
}

function familyKitListProblems(value: unknown, rules: Raw): string[] {
  if (!Array.isArray(value) || value.length === 0) return ['familyKits must be a non-empty list']
  return value.flatMap((row, at) => familyKitRowProblems(row, `familyKits[${at}]`, rules))
}

function familyKitRowProblems(row: unknown, where: string, rules: Raw): string[] {
  if (!isPlainMap(row)) return [`${where} must be a row`]
  return [
    ...(SNAKE_ID.test(String(row.familyId)) ? [] : [`${where}.familyId must be a snake_case id`]),
    ...(isText(row.merchantVariant) ? [] : [`${where}.merchantVariant must be text`]),
    ...premiumRuleRefProblems(row.premiumRule, where, rules),
    ...(row.itemId === null || SNAKE_ID.test(String(row.itemId))
      ? []
      : [`${where}.itemId must be a kit item id or null`]),
    ...unknownFieldProblems(row, where, FAMILY_KIT_ROW_FIELDS),
  ]
}

function noFamilyKitProblems(value: unknown, rules: Raw): string[] {
  if (!isPlainMap(value)) return ['noFamilyKit must be { premiumRule, itemId: null }']
  return [
    ...premiumRuleRefProblems(value.premiumRule, 'noFamilyKit', rules),
    ...(value.itemId === null ? [] : ['noFamilyKit.itemId must be null: premium only']),
    ...unknownFieldProblems(value, 'noFamilyKit', NO_FAMILY_ROW_FIELDS),
  ]
}

function premiumRuleRefProblems(value: unknown, where: string, rules: Raw): string[] {
  return isText(value) && value in rules
    ? []
    : [`${where}.premiumRule names no rule of premiumRules`]
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isText)
}
