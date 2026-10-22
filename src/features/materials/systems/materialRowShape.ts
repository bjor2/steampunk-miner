/**
 * The schema of one `materials.json` row (ticket 444): `id, pool, slot, family, epithet,
 * silhouette, pattern, hueSlot, gradeBand, rarity, hero, flavour`, the optional ore rules span,
 * and nothing else. A row never carries a gate class: the gate comes from the family only (#142),
 * so rarity can never open or close one (#139 GD ruling 2).
 *
 * `pool` and `slot` are data tags only (TD ruling on ticket 446, 6226236698 and addendum
 * 6226264758; landed in ticket 447): the species set a row belongs to (`legacy` for P1 and P2) and
 * the stable kind slot id it binds to (`legacy.c1`), so a roster finds its species by `(pool, slot)`,
 * never by position. The kinds table that owns the slots lives in the ores slice.
 *
 * `fromOreRules` and `beforeOreRules` are optional (ticket 736): the ore rules span a row binds its
 * slot under (`materialOreRules.ts`), so a pool can swap one slot's species at a rules version.
 */
import { oreRulesSpanProblems } from './materialOreRules'

export const MATERIAL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic'] as const

export type MaterialRarity = (typeof MATERIAL_RARITIES)[number]

export const MATERIAL_ROW_FIELDS: readonly string[] = [
  'id',
  'pool',
  'slot',
  'family',
  'epithet',
  'silhouette',
  'pattern',
  'hueSlot',
  'gradeBand',
  'rarity',
  'hero',
  'flavour',
  'fromOreRules',
  'beforeOreRules',
]

/** Kebab-case only, so a species id can never read as an ore id (`<family>_t<tier>`). */
export const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * A kind slot id is its kinds table's id, a dot and a slot name (`legacy.c1`), as `ores.economy.json`
 * writes it. The table need not be named like the pool: an act pool (`foothold`) binds `mixed.*`.
 */
const KIND_SLOT_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/

const FIRST_BAND = 1
const LAST_BAND = 5
const GATE_FIELD = 'gateClass'

type Raw = Record<string, unknown>

/** Why a row is not the row shape; empty when it is. Cross-row rules live in the table. */
export function materialRowShapeProblems(row: Raw, where: string): string[] {
  return [
    ...(KEBAB_ID.test(String(row.id)) ? [] : [`${where}.id must be kebab-case`]),
    ...(isPoolId(row.pool) ? [] : [`${where}.pool must be a kebab-case pool id`]),
    ...(isKindSlotId(row.slot) ? [] : [`${where}.slot must be a kind slot id (<table>.<slot>)`]),
    ...['family', 'epithet', 'flavour']
      .filter((field) => !isText(row[field]))
      .map((field) => `${where}.${field} must be text`),
    ...['silhouette', 'pattern', 'hueSlot']
      .filter((field) => !KEBAB_ID.test(String(row[field])))
      .map((field) => `${where}.${field} must name a kebab-case look id`),
    ...(isBandWindow(row.gradeBand) ? [] : [`${where}.gradeBand must be [first, last] in 1..5`]),
    ...(isRarity(row.rarity)
      ? []
      : [`${where}.rarity must be one of ${MATERIAL_RARITIES.join(', ')}`]),
    ...(typeof row.hero === 'boolean' ? [] : [`${where}.hero must be true or false`]),
    ...oreRulesSpanProblems(row, where),
    ...gateFieldProblems(row, where),
    ...unknownFieldProblems(row, where),
  ]
}

export function isRarity(value: unknown): value is MaterialRarity {
  return (MATERIAL_RARITIES as readonly unknown[]).includes(value)
}

function gateFieldProblems(row: Raw, where: string): string[] {
  if (!(GATE_FIELD in row)) return []
  return [`${where}.${GATE_FIELD} is refused: the gate class comes from the family only (#142)`]
}

function unknownFieldProblems(row: Raw, where: string): string[] {
  return Object.keys(row)
    .filter((field) => field !== GATE_FIELD && !MATERIAL_ROW_FIELDS.includes(field))
    .map((field) => `${where}.${field} is not a material field`)
}

function isPoolId(pool: unknown): pool is string {
  return typeof pool === 'string' && KEBAB_ID.test(pool)
}

function isKindSlotId(slot: unknown): slot is string {
  return typeof slot === 'string' && KIND_SLOT_ID.test(slot)
}

function isBandWindow(window: unknown): window is [number, number] {
  return (
    Array.isArray(window) &&
    window.length === 2 &&
    window.every(isBand) &&
    (window[0] as number) <= (window[1] as number)
  )
}

function isBand(band: unknown): boolean {
  return Number.isInteger(band) && (band as number) >= FIRST_BAND && (band as number) <= LAST_BAND
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
