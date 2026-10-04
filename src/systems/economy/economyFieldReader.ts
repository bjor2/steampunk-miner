/**
 * Reads one field of the economy file and records a problem instead of throwing, so a broken
 * file lists every problem at once (the same "refused, never trimmed" rule as scenarios). A field
 * with a problem reads as a harmless stand-in; the caller refuses the whole file when any
 * problem was recorded, so a stand-in never reaches a formula.
 */
import { fromCanonical, isNonNegativeMoneyText, ZERO_MONEY, type Money } from '../money'
import type { BoundedRange } from './economyDefinition'

export interface FieldReader {
  readonly problems: string[]
  record(problem: string): void
  object(path: string, value: unknown): Record<string, unknown>
  list(path: string, value: unknown): unknown[]
  text(path: string, value: unknown): string
  /** A canonical-ready decimal string >= 0, read as Money (#5). */
  money(path: string, value: unknown): Money
  safeInteger(path: string, value: unknown): number
  /** A bounded, finite JSON number (engine and enemy ranges, #5 rule 5). */
  boundedNumber(path: string, value: unknown): number
}

export function createFieldReader(): FieldReader {
  const problems: string[] = []
  const record = (problem: string) => problems.push(problem)
  return {
    problems,
    record,
    object: (path, value) => (isPlainObject(value) ? value : refuse(record, path, 'an object', {})),
    list: (path, value) => (Array.isArray(value) ? value : refuse(record, path, 'a list', [])),
    text: (path, value) => (typeof value === 'string' ? value : refuse(record, path, 'text', '')),
    money: (path, value) =>
      isNonNegativeMoneyText(value)
        ? fromCanonical(value as string)
        : refuse(record, path, 'a decimal string >= 0', ZERO_MONEY),
    safeInteger: (path, value) =>
      Number.isSafeInteger(value) ? (value as number) : refuse(record, path, 'a safe integer', 0),
    boundedNumber: (path, value) =>
      isFiniteNumber(value) ? value : refuse(record, path, 'a finite number', 0),
  }
}

function refuse<T>(
  record: (problem: string) => void,
  path: string,
  expected: string,
  standIn: T,
): T {
  record(`${path} must be ${expected}`)
  return standIn
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function readRange(reader: FieldReader, path: string, value: unknown): BoundedRange {
  const range = reader.object(path, value)
  return {
    min: reader.boundedNumber(`${path}.min`, range.min),
    max: reader.boundedNumber(`${path}.max`, range.max),
  }
}

export function readIntegerList(reader: FieldReader, path: string, value: unknown): number[] {
  return reader
    .list(path, value)
    .map((entry, index) => reader.safeInteger(`${path}[${index}]`, entry))
}

export function readLiteral<T extends string>(
  reader: FieldReader,
  path: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if ((allowed as readonly unknown[]).includes(value)) return value as T
  reader.record(`${path} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`)
  return allowed[0]
}
