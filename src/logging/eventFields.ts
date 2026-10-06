/**
 * The value kinds a run-event payload field may have, and the checks for them (#11 section 1,
 * value rules): integers are safe-integer JSON numbers, every Money/BigStat is its canonical
 * string (#5), ids and enums are strings, booleans are booleans, and floats exist only in
 * `perf_sample`. Each kind maps to the TypeScript type the recorder must pass, so the registry is
 * both the runtime schema and the compile-time one.
 */
import { isNestedTooDeep, MAX_JSON_NESTING_DEPTH } from '../systems/jsonNesting'
import { fromCanonical, toCanonical } from '../systems/money'

export type FieldKind =
  | 'integer'
  | 'money'
  | 'text'
  | 'flag'
  | 'float'
  /** A JSON object of strings, safe integers, booleans and nested lists/objects of them. */
  | 'jsonArgs'
  | { readonly oneOf: readonly string[] }
  | { readonly listOf: PayloadFields }
  | { readonly mapOf: FieldKind }

export type PayloadFields = { readonly [field: string]: FieldKind }

export type ValueOfKind<K> = K extends 'integer' | 'float'
  ? number
  : K extends 'money' | 'text'
    ? string
    : K extends 'flag'
      ? boolean
      : K extends 'jsonArgs'
        ? Readonly<Record<string, unknown>>
        : K extends { readonly oneOf: readonly (infer O)[] }
          ? O
          : K extends { readonly listOf: infer F }
            ? readonly PayloadOf<F>[]
            : K extends { readonly mapOf: infer M }
              ? Readonly<Record<string, ValueOfKind<M>>>
              : never

export type PayloadOf<F> = { readonly [N in keyof F]: ValueOfKind<F[N]> }

/** Every problem with `payload` against `fields`; `path` names where it sits, for the message. */
export function payloadProblems(payload: unknown, fields: PayloadFields, path: string): string[] {
  if (!isJsonObject(payload)) return [`${path} must be an object`]
  return [
    ...unknownFieldProblems(payload, fields, path),
    ...declaredFieldProblems(payload, fields, path),
  ]
}

function unknownFieldProblems(
  payload: Record<string, unknown>,
  fields: PayloadFields,
  path: string,
): string[] {
  return Object.keys(payload)
    .filter((name) => !Object.hasOwn(fields, name))
    .map((name) => `${path}.${name} is not a registered field`)
}

/** Checks only the fields `fields` declares; other keys are the caller's concern. */
export function declaredFieldProblems(
  payload: Record<string, unknown>,
  fields: PayloadFields,
  path: string,
): string[] {
  return Object.entries(fields).flatMap(([name, kind]) =>
    valueProblems(payload[name], kind, `${path}.${name}`),
  )
}

function valueProblems(value: unknown, kind: FieldKind, path: string): string[] {
  if (kind === 'jsonArgs') return jsonArgsProblems(value, path)
  if (typeof kind === 'string') return scalarProblems(value, kind, path)
  if ('oneOf' in kind) return oneOfProblems(value, kind.oneOf, path)
  if ('listOf' in kind) return listProblems(value, kind.listOf, path)
  return mapProblems(value, kind.mapOf, path)
}

type ScalarKind = Exclude<Extract<FieldKind, string>, 'jsonArgs'>

const SCALAR_CHECKS: Record<
  ScalarKind,
  { isValid: (value: unknown) => boolean; expected: string }
> = {
  integer: { isValid: Number.isSafeInteger, expected: 'a safe integer' },
  money: { isValid: isCanonicalMoneyText, expected: 'a canonical decimal string' },
  text: { isValid: (value) => typeof value === 'string', expected: 'a string' },
  flag: { isValid: (value) => typeof value === 'boolean', expected: 'a boolean' },
  float: { isValid: Number.isFinite, expected: 'a finite number' },
}

function scalarProblems(value: unknown, kind: ScalarKind, path: string): string[] {
  const check = SCALAR_CHECKS[kind]
  if (check.isValid(value)) return []
  return [`${path} must be ${check.expected}, got ${quote(value)}`]
}

/** The depth check runs first: the exactness walk recurses, and so does quoting the value (#100). */
function jsonArgsProblems(value: unknown, path: string): string[] {
  if (isNestedTooDeep(value))
    return [`${path} must nest at most ${MAX_JSON_NESTING_DEPTH} levels deep`]
  if (isExactJsonObject(value)) return []
  return [`${path} must be an object without floats, got ${quote(value)}`]
}

function oneOfProblems(value: unknown, allowed: readonly string[], path: string): string[] {
  if (typeof value === 'string' && allowed.includes(value)) return []
  return [`${path} must be one of ${allowed.join(', ')}, got ${quote(value)}`]
}

function listProblems(value: unknown, itemFields: PayloadFields, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} must be a list, got ${quote(value)}`]
  return value.flatMap((item, index) => payloadProblems(item, itemFields, `${path}[${index}]`))
}

function mapProblems(value: unknown, valueKind: FieldKind, path: string): string[] {
  if (!isJsonObject(value)) return [`${path} must be an object, got ${quote(value)}`]
  return Object.entries(value).flatMap(([key, entry]) =>
    valueProblems(entry, valueKind, `${path}.${key}`),
  )
}

/** Canonical means exactly what `toCanonical` writes, so two equal amounts have one spelling. */
export function isCanonicalMoneyText(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return toCanonical(fromCanonical(value)) === value
  } catch {
    return false
  }
}

function isExactJsonObject(value: unknown): boolean {
  return isJsonObject(value) && Object.values(value).every(isExactJsonValue)
}

function isExactJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isSafeInteger(value)
  if (Array.isArray(value)) return value.every(isExactJsonValue)
  return isExactJsonObject(value)
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function quote(value: unknown): string {
  return JSON.stringify(value) ?? 'nothing'
}
