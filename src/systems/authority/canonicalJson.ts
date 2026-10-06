/**
 * Canonical JSON of authority state (decision #11 section 3): object keys sorted, Money as its
 * canonical string, integers as JSON numbers. Anything else that could print differently on two
 * machines (floats, unsafe integers, undefined, class instances) is refused, so a digest over
 * this text is the same everywhere. So is anything nested past `MAX_JSON_NESTING_DEPTH` (#100),
 * with a `JsonNestingTooDeepError` instead of a stack overflow.
 */
import { JsonNestingTooDeepError, MAX_JSON_NESTING_DEPTH } from '../jsonNesting'
import { isMoney, toCanonical } from '../money'

export function toCanonicalJson(value: unknown): string {
  return canonicalValue(value, 0)
}

/** `depth` counts the lists and objects around `value`. */
function canonicalValue(value: unknown, depth: number): string {
  if (isMoney(value)) return JSON.stringify(toCanonical(value))
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') return canonicalInteger(value)
  if (Array.isArray(value)) return canonicalArray(value, memberDepthOf(depth))
  if (isPlainObject(value)) return canonicalObject(value, memberDepthOf(depth))
  throw new TypeError(`canonical JSON cannot hold ${describeValue(value)}`)
}

function canonicalInteger(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`canonical JSON holds safe integers only, got ${value}`)
  }
  return Object.is(value, -0) ? '0' : String(value)
}

function memberDepthOf(depth: number): number {
  if (depth >= MAX_JSON_NESTING_DEPTH) throw new JsonNestingTooDeepError()
  return depth + 1
}

function canonicalArray(value: readonly unknown[], depth: number): string {
  return `[${value.map((item) => canonicalValue(item, depth)).join(',')}]`
}

function canonicalObject(value: Record<string, unknown>, depth: number): string {
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], depth)}`)
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
