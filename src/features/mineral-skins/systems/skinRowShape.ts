/**
 * The schema of `mineralSkins.json` (ticket 591): a layer entry is `{ id }`, a skin row is
 * `{ species, base, vein, palette, sheen }`, every id kebab-case and nothing else. Cross-row rules
 * (known species and layers, one skin per species, no two alike) live in the table.
 */
import { SKIN_LAYER_KINDS } from './skinLayers'

const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const LAYER_FIELDS: readonly string[] = ['id']
const SKIN_FIELDS: readonly string[] = ['species', ...SKIN_LAYER_KINDS]

type Raw = Record<string, unknown>

export function layerEntryShapeProblems(entry: Raw, where: string): string[] {
  return [
    ...(isKebab(entry.id) ? [] : [`${where}.id must be kebab-case`]),
    ...unknownFieldProblems(entry, LAYER_FIELDS, where),
  ]
}

export function skinRowShapeProblems(row: Raw, where: string): string[] {
  return [
    ...SKIN_FIELDS.filter((field) => !isKebab(row[field])).map(
      (field) => `${where}.${field} must be a kebab-case id`,
    ),
    ...unknownFieldProblems(row, SKIN_FIELDS, where),
  ]
}

function unknownFieldProblems(entry: Raw, fields: readonly string[], where: string): string[] {
  return Object.keys(entry)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a field`)
}

function isKebab(value: unknown): value is string {
  return typeof value === 'string' && KEBAB_ID.test(value)
}
