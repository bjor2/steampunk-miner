/**
 * Payload checks for commands arriving as JSON (live or replayed). Each command type declares its
 * fields as data; a payload with a missing, unknown or wrongly kinded field is refused, never
 * trimmed, with every problem listed.
 */
import { cmp, fromCanonical, ZERO_MONEY } from '../money'

export type FieldKind = 'wholeNumber' | 'safeInteger' | 'nonNegativeMoney'

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
  }

function fieldKindProblems(name: string, value: unknown, kind: FieldKind): string[] {
  const check = FIELD_CHECKS[kind]
  if (check.isValid(value)) return []
  return [`${name} must be ${check.expected}, got ${JSON.stringify(value) ?? 'nothing'}`]
}

export function isWholeNumber(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isNonNegativeMoneyText(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return cmp(fromCanonical(value), ZERO_MONEY) >= 0
  } catch {
    return false
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
