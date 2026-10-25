/**
 * The schema of one `planetKits.json` row (ticket 820, spec #647): a merchant row is
 * `planet, name, variant, buys, premiumOre, stock` and a kit item row is `id, name, hoverLine, kind,
 * homePlanet, sale, stackLimit (consumables only), effect, tradeOff`, nothing else. The lock keys a
 * kit on the stable planet id (s,p) as canonical text, as #790 does, and on g for prices; a row
 * never carries a price number, which lives in `planet-kit.economy.json`.
 *
 * Copy is Progression's (#680): a name of at most `TITLE_WORDS_MAX` words and a hover line of at
 * most `TOOLTIP_LINE_WORDS_MAX`. Cross-row rules (one kit per planet, the hazard match, the
 * premium species, the stock rule) live in `planetKitGuards.ts`.
 */
import { TITLE_WORDS_MAX, TOOLTIP_LINE_WORDS_MAX } from '../../../constants/uiParts'
import { wordCountOf } from '../../../systems/views/uiTextBudget'

export const KIT_ITEM_KINDS = ['tool', 'consumable'] as const
export type KitItemKind = (typeof KIT_ITEM_KINDS)[number]

/** Where an item is sold: its home merchant only, or its home merchant and every later one. */
export const KIT_SALES = ['home-only', 'home-and-later'] as const
export type KitSale = (typeof KIT_SALES)[number]

/** What an item trades for its gain: an owned track value, a hold slot's time, or a return trip. */
export const TRADE_OFF_COSTS = [
  'return_trip',
  'engine_thrust',
  'held_still',
  'cut_speed',
  'horizontal_speed',
] as const
export type TradeOffCost = (typeof TRADE_OFF_COSTS)[number]

export const MERCHANT_ROW_FIELDS: readonly string[] = [
  'planet',
  'name',
  'variant',
  'buys',
  'premiumOre',
  'stock',
]
export const KIT_ITEM_ROW_FIELDS: readonly string[] = [
  'id',
  'name',
  'hoverLine',
  'kind',
  'homePlanet',
  'sale',
  'stackLimit',
  'effect',
  'tradeOff',
]
const EFFECT_FIELDS: readonly string[] = ['hazard', 'hazardEffect', 'behaviour', 'summary']
const TRADE_OFF_FIELDS: readonly string[] = ['costs', 'summary']

/** A stats.json id: snake_case, as `cache_crate`. */
export const SNAKE_ID = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
/** A species or pool id: kebab-case, as `honey-amber-quartzine`. */
export const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
/** Canonical whole-number text for a system or a place, as `campaignIndex` reads it. */
const CANONICAL_WHOLE = /^[1-9][0-9]*$/

export type Raw = Record<string, unknown>

/** Why a merchant row is not the row shape; empty when it is. */
export function merchantRowShapeProblems(row: Raw, where: string): string[] {
  return [
    ...planetIdProblems(row.planet, `${where}.planet`),
    ...titleProblems(row.name, `${where}.name`),
    ...titleProblems(row.variant, `${where}.variant`),
    ...buysProblems(row.buys, `${where}.buys`),
    ...(KEBAB_ID.test(String(row.premiumOre))
      ? []
      : [`${where}.premiumOre must be a kebab-case species id`]),
    ...(isIdList(row.stock) ? [] : [`${where}.stock must be a list of snake_case item ids`]),
    ...unknownFieldProblems(row, where, MERCHANT_ROW_FIELDS),
  ]
}

/** Why a kit item row is not the row shape; empty when it is. */
export function kitItemRowShapeProblems(row: Raw, where: string): string[] {
  return [
    ...(SNAKE_ID.test(String(row.id)) ? [] : [`${where}.id must be a snake_case stats.json id`]),
    ...titleProblems(row.name, `${where}.name`),
    ...hoverLineProblems(row.hoverLine, `${where}.hoverLine`),
    ...oneOfProblems(row.kind, KIT_ITEM_KINDS, `${where}.kind`),
    ...planetIdProblems(row.homePlanet, `${where}.homePlanet`),
    ...oneOfProblems(row.sale, KIT_SALES, `${where}.sale`),
    ...stackLimitProblems(row, where),
    ...effectProblems(row.effect, `${where}.effect`),
    ...tradeOffProblems(row.tradeOff, `${where}.tradeOff`),
    ...unknownFieldProblems(row, where, KIT_ITEM_ROW_FIELDS),
  ]
}

export function isPlanetId(value: unknown): value is { system: string; planet: string } {
  if (!isPlainMap(value)) return false
  return isCanonicalWhole(value.system) && isCanonicalWhole(value.planet)
}

export function isPlainMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function planetIdProblems(value: unknown, where: string): string[] {
  return isPlanetId(value) ? [] : [`${where} must be { system, planet } as canonical whole text`]
}

function titleProblems(value: unknown, where: string): string[] {
  if (!isText(value)) return [`${where} must be text`]
  const words = wordCountOf(value)
  return words <= TITLE_WORDS_MAX
    ? []
    : [`${where} "${value}" is ${words} words, over ${TITLE_WORDS_MAX}`]
}

function hoverLineProblems(value: unknown, where: string): string[] {
  if (!isText(value)) return [`${where} must be text`]
  const words = wordCountOf(value)
  if (words <= TOOLTIP_LINE_WORDS_MAX) return []
  return [`${where} "${value}" is ${words} words, over ${TOOLTIP_LINE_WORDS_MAX}`]
}

function buysProblems(value: unknown, where: string): string[] {
  if (!isPlainMap(value)) return [`${where} must be { pool }`]
  return [
    ...(KEBAB_ID.test(String(value.pool)) ? [] : [`${where}.pool must be a kebab-case pool id`]),
    ...unknownFieldProblems(value, where, ['pool']),
  ]
}

/** A consumable carries its stack limit, a whole number from 1; a tool carries none. */
function stackLimitProblems(row: Raw, where: string): string[] {
  const has = 'stackLimit' in row
  if (row.kind === 'tool') return has ? [`${where}.stackLimit is for consumables only`] : []
  if (!has) return [`${where}.stackLimit is required on a consumable`]
  return isWholeFrom(row.stackLimit, 1) ? [] : [`${where}.stackLimit must be a whole number from 1`]
}

function effectProblems(value: unknown, where: string): string[] {
  if (!isPlainMap(value)) return [`${where} must be { hazard, hazardEffect, behaviour, summary }`]
  return [
    ...nullableIdProblems(value.hazard, KEBAB_ID, `${where}.hazard`, 'a hazard kind id'),
    ...nullableIdProblems(value.hazardEffect, KEBAB_ID, `${where}.hazardEffect`, 'a hazard effect'),
    ...((value.hazard === null) === (value.hazardEffect === null)
      ? []
      : [`${where}.hazard and .hazardEffect are both set or both null`]),
    ...(SNAKE_ID.test(String(value.behaviour))
      ? []
      : [`${where}.behaviour must be a snake_case behaviour id`]),
    ...(isText(value.summary) ? [] : [`${where}.summary must be text`]),
    ...unknownFieldProblems(value, where, EFFECT_FIELDS),
  ]
}

function tradeOffProblems(value: unknown, where: string): string[] {
  if (!isPlainMap(value)) return [`${where} must be { costs, summary }`]
  return [
    ...oneOfProblems(value.costs, TRADE_OFF_COSTS, `${where}.costs`),
    ...(isText(value.summary) ? [] : [`${where}.summary must be text`]),
    ...unknownFieldProblems(value, where, TRADE_OFF_FIELDS),
  ]
}

function nullableIdProblems(value: unknown, id: RegExp, where: string, what: string): string[] {
  if (value === null) return []
  return id.test(String(value)) ? [] : [`${where} must be null or ${what}`]
}

function oneOfProblems(value: unknown, allowed: readonly string[], where: string): string[] {
  return allowed.includes(String(value)) ? [] : [`${where} must be one of ${allowed.join(', ')}`]
}

export function unknownFieldProblems(row: Raw, where: string, fields: readonly string[]): string[] {
  return Object.keys(row)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a field of this row`)
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => SNAKE_ID.test(String(id)))
}

function isCanonicalWhole(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_WHOLE.test(value)
}

export function isWholeFrom(value: unknown, lowest: number): value is number {
  return Number.isInteger(value) && (value as number) >= lowest
}
