/**
 * Why a save write failed (#470 P1-8, ticket 479): a browser's storage is full (`setItem` or an
 * IndexedDB put past the origin's quota), the page may not store at all (a private window, storage
 * turned off), or anything else. The checkpoint logs the cause with `checkpoint_failed` and the
 * player sees "progress not saved" until the next write lands.
 */
import { isJsonObject } from '../authority/payloadFields'

export const SAVE_FAILURE_CAUSES = ['quota', 'security', 'other'] as const

export type SaveFailureCause = (typeof SAVE_FAILURE_CAUSES)[number]

/** Chromium and WebKit say `QuotaExceededError`; older Firefox says `NS_ERROR_DOM_QUOTA_REACHED`. */
const QUOTA_ERROR_NAMES: readonly string[] = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']
const SECURITY_ERROR_NAME = 'SecurityError'

export function saveFailureCauseOf(error: unknown): SaveFailureCause {
  const name = errorNameOf(error)
  if (QUOTA_ERROR_NAMES.includes(name)) return 'quota'
  return name === SECURITY_ERROR_NAME ? 'security' : 'other'
}

/** A `DOMException` is an `Error`; a rejected IndexedDB request may hand over any object. */
function errorNameOf(error: unknown): string {
  if (error instanceof Error) return error.name
  return isJsonObject(error) && typeof error.name === 'string' ? error.name : ''
}
