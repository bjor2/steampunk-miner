/**
 * Payload checks for commands arriving as JSON (live or replayed). Each command type declares its
 * fields as data; a payload with a missing, unknown or wrongly kinded field is refused, never
 * trimmed, with every problem listed.
 */
import { isNonNegativeMoneyText } from '../money'
import { isBayId } from '../world/dockBays'

export type FieldKind =
  | 'wholeNumber'
  | 'safeInteger'
  | 'nonNegativeMoney'
  | 'flag'
  | 'text'
  /** An ore tier (a safe integer >= 1) or the word `"all"`, as `SellCargo` takes (#8). */
  | 'tierOrAll'
  /** One of the platform's bays, `"sell"` or `"upgrade"` (#37). */
  | 'bay'
  /** A string, or null for "none": `equipItem` empties a slot with a null item (#162). */
  | 'textOrNull'
  /** An object of strings, as `debug.setVehicleLoadout` names each slot's item (K4). */
  | 'textMap'
  /** A list of strings, as `debug.setVehicleLoadout` names the items owned with no slot (K4). */
  | 'textList'

export type PayloadFields = Readonly<Record<string, FieldKind>>

export function payloadProblems(payload: unknown, fields: PayloadFields): string[] {
  if (!isJsonObject(payload)) return ['payload must be an object']
  return [...unknownFieldProblems(payload, fields), ...declaredFieldProblems(payload, fields)]
}

function unknownFieldProblems(payload: Record<string, unknown>, fields: PayloadFields): string[] {
  return Object.keys(payload)
    .filter((name) => !(name in fields))
    .map((name) => `unknown payload field "${name}"`)
}

function declaredFieldProblems(payload: Record<string, unknown>, fields: PayloadFields): string[] {
  return Object.entries(fields).flatMap(([name, kind]) =>
    fieldKindProblems(name, payload[name], kind),
  )
}

const FIELD_CHECKS: Record<FieldKind, { isValid: (value: unknown) => boolean; expected: string }> =
  {
    wholeNumber: { isValid: isWholeNumber, expected: 'a safe integer >= 0' },
    safeInteger: { isValid: Number.isSafeInteger, expected: 'a safe integer' },
    nonNegativeMoney: { isValid: isNonNegativeMoneyText, expected: 'a decimal string >= 0' },
    flag: { isValid: (value) => typeof value === 'boolean', expected: 'true or false' },
    text: { isValid: (value) => typeof value === 'string', expected: 'a string' },
    tierOrAll: { isValid: isTierOrAll, expected: 'an ore tier >= 1 or "all"' },
    bay: { isValid: isBayId, expected: '"sell", "upgrade" or "refinery"' },
    textOrNull: {
      isValid: (value) => value === null || typeof value === 'string',
      expected: 'a string or null',
    },
    textMap: { isValid: isTextMap, expected: 'an object of strings' },
    textList: { isValid: isTextList, expected: 'a list of strings' },
  }

function fieldKindProblems(name: string, value: unknown, kind: FieldKind): string[] {
  const check = FIELD_CHECKS[kind]
  if (check.isValid(value)) return []
  return [`${name} must be ${check.expected}, got ${JSON.stringify(value) ?? 'nothing'}`]
}

function isTextMap(value: unknown): boolean {
  return isJsonObject(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isTierOrAll(value: unknown): boolean {
  return value === 'all' || (Number.isSafeInteger(value) && (value as number) >= 1)
}

export function isWholeNumber(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
