/**
 * Why a palette is not ticket 775's (`paletteRows.ts`); empty when it is. Each guard holds one
 * rule of the lock: name parts are capitalised words, no two alike, and the longest name with the
 * reserved digits keeps the budget; every act a later system can hold has prefixes and looks and
 * names no other act; looks differ pairwise in hue and in motif; the new-content families carry
 * stable snake_case ids and distinct names, each with its behaviour, copy and rig part
 * (`familyGuards.ts`, ticket 780); the size classes hold the ×1.0 class and one a hard start may
 * draw; the hard-start ceiling is a ratio.
 */
import { isMoneyText } from '../../../systems/money'
import { familyRowProblems, type CopyFillBudget } from './familyGuards'

type Raw = Record<string, unknown>

const CAPITALISED_WORD = /^[A-Z][a-z]+$/
const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const HOOK_FIELDS = {
  mindful: ['{g}', '{ground}', '{pays}', '{mind}'],
  paying: ['{g}', '{ground}', '{pays}'],
}
const WHOLE_RADIUS_BP = 10000

export function paletteProblems(palette: unknown, economy: unknown, actIds: readonly string[]) {
  const raw = asMap(palette)
  const names = asMap(raw.names)
  return [
    ...namePartProblems(names, actIds),
    ...hookTemplateProblems(asMap(names.hookTemplates)),
    ...lookProblems(raw.looks, actIds),
    ...newContentProblems(asMap(raw.newContentSlots), copyFillBudgetOf(names)),
    ...sizeClassProblems(asMap(asMap(economy).sizeClasses)),
    ...hardStartProblems(asMap(asMap(economy).hardStart)),
  ]
}

function namePartProblems(names: Raw, actIds: readonly string[]): string[] {
  const byAct = asMap(names.prefixesByAct)
  const prefixes = Object.values(byAct).flatMap((list) => (Array.isArray(list) ? list : []))
  return [
    ...actCoverageProblems(Object.keys(byAct), actIds, 'names.prefixesByAct'),
    ...wordListProblems(prefixes, 'names.prefixesByAct'),
    ...wordListProblems(names.nouns, 'names.nouns'),
    ...wholeProblems(names, ['charactersMax', 'numberDigitsReserved'], 'names'),
    ...nameBudgetProblems(names, prefixes),
  ]
}

/** The longest prefix, a space, the longest noun, a space and the reserved digits fit the budget. */
function nameBudgetProblems(names: Raw, prefixes: readonly unknown[]): string[] {
  const nouns = Array.isArray(names.nouns) ? names.nouns : []
  const words = [...prefixes, ...nouns].filter((word) => typeof word === 'string')
  if (words.length === 0 || !isWhole(names.charactersMax) || !isWhole(names.numberDigitsReserved))
    return []
  const longest = longestOf(prefixes) + 1 + longestOf(nouns) + 1 + names.numberDigitsReserved
  if (longest <= names.charactersMax) return []
  return [
    `names: the longest name with ${names.numberDigitsReserved} digits takes ${longest} characters, over ${names.charactersMax}`,
  ]
}

function hookTemplateProblems(templates: Raw): string[] {
  return Object.entries(HOOK_FIELDS).flatMap(([key, fields]) => {
    const template = templates[key]
    if (typeof template !== 'string') return [`names.hookTemplates.${key} must be a template`]
    const missing = fields.filter((field) => !template.includes(field))
    const stray = template.includes('{mind}') && !fields.includes('{mind}')
    return [
      ...missing.map((field) => `names.hookTemplates.${key} lacks ${field}`),
      ...(stray ? [`names.hookTemplates.${key} names {mind}, which it has no slot for`] : []),
    ]
  })
}

function lookProblems(looks: unknown, actIds: readonly string[]): string[] {
  if (!Array.isArray(looks) || looks.length === 0) return ['looks must list the biome looks']
  const rows = looks.map(asMap)
  return [
    ...rows.flatMap((look, at) => lookRowProblems(look, `looks[${at}]`)),
    ...actCoverageProblems(
      rows.map((look) => look.act),
      actIds,
      'looks',
    ),
    ...duplicateProblems(
      rows.map((look) => look.id),
      'looks',
      'id',
    ),
    ...duplicateProblems(
      rows.map((look) => look.hue),
      'looks',
      'hue',
    ),
    ...duplicateProblems(
      rows.map((look) => look.groundMotif),
      'looks',
      'groundMotif',
    ),
  ]
}

function lookRowProblems(look: Raw, where: string): string[] {
  return [
    ...(typeof look.id === 'string' && KEBAB_ID.test(look.id)
      ? []
      : [`${where}.id must be kebab-case`]),
    ...(isText(look.hue) ? [] : [`${where}.hue must name the hue pair`]),
    ...(isText(look.groundMotif) ? [] : [`${where}.groundMotif must name the ground motif`]),
  ]
}

/** The longest `<Prefix> <Noun> <g>` the names can draw, the folio at its reserved digits. */
function copyFillBudgetOf(names: Raw): CopyFillBudget {
  const prefixes = Object.values(asMap(names.prefixesByAct)).flat()
  const nouns = Array.isArray(names.nouns) ? names.nouns : []
  const digits = isWhole(names.numberDigitsReserved) ? names.numberDigitsReserved : 1
  const longestFolio = '9'.repeat(digits)
  const longestName = `${'W'.repeat(longestOf(prefixes))} ${'W'.repeat(longestOf(nouns))} ${longestFolio}`
  return { longestName, longestFolio }
}

function newContentProblems(slots: Raw, budget: CopyFillBudget): string[] {
  if (!isText(slots.set)) return ['newContentSlots.set must name the set']
  if (!Array.isArray(slots.families) || slots.families.length === 0)
    return ['newContentSlots.families must list the new families']
  const rows = slots.families.map(asMap)
  return [
    ...rows.flatMap((family, at) =>
      familyRowProblems(family, `newContentSlots.families[${at}]`, budget),
    ),
    ...duplicateProblems(
      rows.map((family) => family.id),
      'newContentSlots.families',
      'id',
    ),
    ...duplicateProblems(
      rows.map((family) => family.name),
      'newContentSlots.families',
      'name',
    ),
  ]
}

function sizeClassProblems(sizes: Raw): string[] {
  if (!Array.isArray(sizes.classes) || sizes.classes.length === 0)
    return ['sizeClasses.classes must list the size classes']
  const rows = sizes.classes.map(asMap)
  const hasWhole = rows.some((row) => row.radiusBp === WHOLE_RADIUS_BP)
  const hasHardDraw = rows.some((row) => row.standardOnly === false)
  return [
    ...wholeProblems(sizes, ['baseTargetSeconds'], 'sizeClasses'),
    ...rows.flatMap((row, at) => sizeRowProblems(row, `sizeClasses.classes[${at}]`)),
    ...duplicateProblems(
      rows.map((row) => row.id),
      'sizeClasses.classes',
      'id',
    ),
    ...(hasWhole ? [] : [`sizeClasses.classes must hold the x1.0 class (${WHOLE_RADIUS_BP} bp)`]),
    ...(hasHardDraw ? [] : ['sizeClasses.classes must hold a class a hard start may draw']),
  ]
}

function sizeRowProblems(row: Raw, where: string): string[] {
  return [
    ...(isText(row.id) ? [] : [`${where}.id must name the class`]),
    ...wholeProblems(row, ['radiusBp'], where),
    ...(typeof row.standardOnly === 'boolean'
      ? []
      : [`${where}.standardOnly must be true or false`]),
  ]
}

function hardStartProblems(hardStart: Raw): string[] {
  return isMoneyText(hardStart.stepCeiling) ? [] : ['hardStart.stepCeiling must be a ratio']
}

/** Every act a later system can hold is named once, and nothing else is named. */
function actCoverageProblems(named: readonly unknown[], actIds: readonly string[], where: string) {
  const missing = actIds.filter((act) => !named.includes(act))
  const unknown = [...new Set(named)].filter(
    (act) => typeof act !== 'string' || !actIds.includes(act),
  )
  return [
    ...missing.map((act) => `${where} names no act "${act}"`),
    ...unknown.map((act) => `${where} names "${String(act)}", which is no mixed act`),
  ]
}

function wordListProblems(list: unknown, where: string): string[] {
  const isWordList =
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((word) => typeof word === 'string' && CAPITALISED_WORD.test(word))
  if (!isWordList) return [`${where} must list capitalised words`]
  return duplicateProblems(list, where, 'word')
}

function duplicateProblems(values: readonly unknown[], where: string, what: string): string[] {
  const seen = new Set<unknown>()
  const twice = new Set<unknown>()
  for (const value of values) (seen.has(value) ? twice : seen).add(value)
  return [...twice].map((value) => `${where} holds the ${what} "${String(value)}" twice`)
}

function wholeProblems(raw: Raw, keys: readonly string[], where: string): string[] {
  return keys
    .filter((key) => !isWhole(raw[key]))
    .map((key) => `${where}.${key} must be a whole number above 0`)
}

function longestOf(words: readonly unknown[]): number {
  return Math.max(0, ...words.map((word) => (typeof word === 'string' ? word.length : 0)))
}

function isWhole(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value
}

function asMap(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {}
}
