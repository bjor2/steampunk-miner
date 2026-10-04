/**
 * Canonical JSON of authority state (decision #11 section 3): object keys sorted, Money as its
 * canonical string, integers as JSON numbers. Anything else that could print differently on two
 * machines (floats, unsafe integers, undefined, class instances) is refused, so a digest over
 * this text is the same everywhere.
 */
import { isMoney, toCanonical } from '../money'

export function toCanonicalJson(value: unknown): string {
  if (isMoney(value)) return JSON.stringify(toCanonical(value))
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') return canonicalInteger(value)
  if (Array.isArray(value)) return `[${value.map(toCanonicalJson).join(',')}]`
  if (isPlainObject(value)) return canonicalObject(value)
  throw new TypeError(`canonical JSON cannot hold ${describeValue(value)}`)
}

function canonicalInteger(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`canonical JSON holds safe integers only, got ${value}`)
  }
  return Object.is(value, -0) ? '0' : String(value)
}

function canonicalObject(value: Record<string, unknown>): string {
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${toCanonicalJson(value[key])}`)
  return `{${members.join(',')}}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function describeValue(value: unknown): string {
  return value === undefined ? 'undefined' : typeof value
}
