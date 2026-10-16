/**
 * The newer of two copies of one save slot (#470 P1-8, ticket 479): a browser keeps each slot in
 * localStorage and mirrors it to IndexedDB, and a start reads whichever copy carries the larger
 * `saveEpoch`, so a write that reached only one store is still the one resumed. A copy whose epoch
 * cannot be read loses to one whose can; equal epochs keep the first, the primary store's copy.
 */
import { isJsonObject, isWholeNumber } from '../authority/payloadFields'

export function newerSaveTextOf(first: string | null, second: string | null): string | null {
  if (first === null || first === second) return first ?? second
  if (second === null) return first
  return epochOrUnreadable(second) > epochOrUnreadable(first) ? second : first
}

/** The file's `saveEpoch`, or null for text that is not a save header. */
export function saveEpochOfText(text: string): number | null {
  const parsed = parsedOrUndefined(text)
  if (!isJsonObject(parsed) || !isWholeNumber(parsed.saveEpoch)) return null
  return parsed.saveEpoch as number
}

const UNREADABLE_EPOCH = -1

function epochOrUnreadable(text: string): number {
  return saveEpochOfText(text) ?? UNREADABLE_EPOCH
}

function parsedOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
