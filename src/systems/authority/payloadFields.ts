/**
 * Payload checks for commands arriving as JSON (live or replayed). Each command type declares its
 * fields as data; a payload with a missing, unknown or wrongly kinded field is refused, never
 * trimmed, with every problem listed.
 */
import { isNonNegativeMoneyText } from '../money'
import { readIndexText } from '../starMap/planetAddress'
import { isAim } from '../vehicle/aim'
import { isDriveSigns } from '../vehicle/driveSigns'
import { isBayId } from '../world/dockBays'
import { isJsonCount } from '../wholeCount'

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
  /** `{ x, y }`, each -1, 0 or 1: the drive signs a pose report carries (ticket 279). */
  | 'driveSigns'
  /** An object of booleans, as `debug.setFlags` names each flag it sets (ticket 547). */
  | 'flagMap'
  /** An index from 1 as canonical decimal text, as a star-map address crosses JSON (ticket 755). */
  | 'indexText'
  /**
   * The drill's aim in 1/64 turns, 0 to 63, or no field at all: a pose aims at its facing without
   * one (ticket 791), so every command before protocol 107 still reads.
   */
  | 'optionalAim'
  /**
   * A whole count from 0 in its JSON spelling (ticket 849): a safe integer, or its canonical
   * decimal text past 2^53, as a Refinery batch of an unbounded hold asks for its units. Every
   * command before protocol 112 wrote a safe integer, so it still reads.
   */
  | 'count'

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
    driveSigns: { isValid: isDriveSigns, expected: 'an x and a y, each -1, 0 or 1' },
    flagMap: { isValid: isFlagMap, expected: 'an object of booleans' },
    indexText: {
      isValid: (value) => readIndexText(value) !== null,
      expected: 'an index from 1 as decimal text',
    },
    optionalAim: {
      isValid: (value) => value === undefined || isAim(value),
      expected: 'a whole step from 0 to 63, or no aim',
    },
    count: {
      isValid: isJsonCount,
      expected: 'a whole count >= 0, its decimal text past 2^53',
    },
  }

function fieldKindProblems(name: string, value: unknown, kind: FieldKind): string[] {
  const check = FIELD_CHECKS[kind]
  if (check.isValid(value)) return []
  return [`${name} must be ${check.expected}, got ${JSON.stringify(value) ?? 'nothing'}`]
}

function isTextMap(value: unknown): boolean {
  return isJsonObject(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function isFlagMap(value: unknown): boolean {
  return isJsonObject(value) && Object.values(value).every((entry) => typeof entry === 'boolean')
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
