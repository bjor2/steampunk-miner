/**
 * The schema of `mineralSkins.json` (ticket 591): a layer entry is `{ id }`, a palette's also
 * carries its `ramp` (ticket 592), a skin row is `{ species, base, vein, palette, sheen }` and a
 * signature skin row `{ planet, base, vein, palette, sheen }` (ticket 603), every id kebab-case, the
 * planet a whole number from 1, and nothing else. Cross-row rules (known species and layers, one skin per species,
 * no two alike, a palette's body on its species' hue slot) live in the table.
 */
import { rampShapeProblems } from './paletteRamps'
import { SKIN_LAYER_KINDS, type SkinLayerKind } from './skinLayers'

const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const LAYER_FIELDS: readonly string[] = ['id']
const PALETTE_FIELDS: readonly string[] = ['id', 'ramp']
const SKIN_FIELDS: readonly string[] = ['species', ...SKIN_LAYER_KINDS]
const SIGNATURE_FIELDS: readonly string[] = ['planet', ...SKIN_LAYER_KINDS]

type Raw = Record<string, unknown>

export function layerEntryShapeProblems(entry: Raw, kind: SkinLayerKind, where: string): string[] {
  return [
    ...(isKebab(entry.id) ? [] : [`${where}.id must be kebab-case`]),
    ...(kind === 'palette' ? rampShapeProblems(entry.ramp, `${where}.ramp`) : []),
    ...unknownFieldProblems(entry, kind === 'palette' ? PALETTE_FIELDS : LAYER_FIELDS, where),
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

export function signatureRowShapeProblems(row: Raw, where: string): string[] {
  return [
    ...(isPlanetIndex(row.planet) ? [] : [`${where}.planet must be a whole planet index from 1`]),
    ...SKIN_LAYER_KINDS.filter((kind) => !isKebab(row[kind])).map(
      (kind) => `${where}.${kind} must be a kebab-case id`,
    ),
    ...unknownFieldProblems(row, SIGNATURE_FIELDS, where),
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

function isPlanetIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}
