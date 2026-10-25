/**
 * Whole counts that grow with the economy only (ticket 849, the TD's Q4 on #823): the hold's units
 * per ore tier, its capacity, and the units a sale, a Refinery batch or a container moves, past
 * the safe integers from cargo level 362. In the state and the events they are bigint.
 *
 * They cross JSON (a save, a section, a log line) in one spelling with one form per count: a
 * safe-integer JSON number while it fits, its canonical decimal text past 2^53. So every save and
 * line a hold up to level 361 writes reads byte for byte as before, and no count is ever rounded
 * through a float (VS on #849).
 */

const LARGEST_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** A count in its JSON spelling. */
export type JsonCount = number | string

export function countToJson(count: bigint): JsonCount {
  return count <= LARGEST_SAFE ? Number(count) : count.toString()
}

/** A count read back from its JSON spelling; call only on a value `isJsonCount` accepts. */
export function countOfJson(value: JsonCount): bigint {
  return BigInt(value)
}

/** Whether `value` is a count from 0 in its one JSON spelling. */
export function isJsonCount(value: unknown): value is JsonCount {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0
  return isDecimalCountText(value) && BigInt(value) > LARGEST_SAFE
}

/**
 * The count as a number held to the safe integers: for a budget a tick or a cell spends a bounded
 * part of (the hold's room for one tick's cut), so the hold above 2^53 still reads as room.
 */
export function countHeldToSafe(count: bigint): number {
  return Number(smallerCount(count, LARGEST_SAFE))
}

/**
 * The count as a safe integer for a model that walks it unit by unit (the on-curve hold of a
 * planet the pacing tables reach); past 2^53 it throws rather than round.
 */
export function countAsSafeInteger(count: bigint): number {
  if (count > LARGEST_SAFE) throw new RangeError(`expected a safe count, got ${count}`)
  return Number(count)
}

export function smallerCount(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

export function largerCount(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

function isDecimalCountText(text: unknown): text is string {
  return typeof text === 'string' && /^[1-9]\d*$/.test(text)
}
