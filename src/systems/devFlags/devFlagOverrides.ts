/**
 * The browser's remembered dev flag overrides (ticket 548, the TD ruling on #547 and its #548
 * ruling, VS 5): the text of one `localStorage` item, `sm.devFlagOverrides.v1`, read only in a
 * debug session (the shell decides that). Per browser, never part of a save.
 *
 * - Only differences from the shipped defaults are kept: an entry that equals its flag's default
 *   is dropped, on read and on write.
 * - Each entry remembers the default in force when it was set. When a release flips that default
 *   the entry is no longer silently kept: one that now equals the new default is dropped and its
 *   flag listed as a changed default; one that opposes the changed default stays, marked pinned.
 * - Unknown ids and malformed entries are dropped on read, and named.
 */
import {
  AUTHORITY_DEV_FLAGS,
  DEV_FLAGS,
  type AuthorityDevFlags,
  type DevFlags,
} from '../../constants/devFlags'

/** Every dev flag id, the client loop's and the authority's. */
export type DevFlagId = keyof DevFlags | keyof AuthorityDevFlags

/** Every dev flag at one value: the shipped defaults, or a session's. */
export type ShippedDevFlags = DevFlags & AuthorityDevFlags

export const SHIPPED_DEV_FLAGS: ShippedDevFlags = { ...DEV_FLAGS, ...AUTHORITY_DEV_FLAGS }

/** The `localStorage` key, one per browser (the TD ruling on #547). */
export const DEV_FLAG_OVERRIDES_KEY = 'sm.devFlagOverrides.v1'

/** One remembered choice: the value, and the default that shipped when it was made. */
export interface DevFlagOverride {
  isOn: boolean
  defaultWhenSet: boolean
}

export type DevFlagOverrides = Readonly<Partial<Record<DevFlagId, DevFlagOverride>>>

/** What a read kept, and what it dropped and why. */
export interface DevFlagOverrideReading {
  overrides: DevFlagOverrides
  /** Flags whose default flipped since the override was set, the override now equal to it. */
  changedDefaults: DevFlagId[]
  /** Ids that are no dev flag, or entries that are no `DevFlagOverride`. */
  droppedIds: string[]
}

export const NO_DEV_FLAG_OVERRIDES: DevFlagOverrideReading = {
  overrides: {},
  changedDefaults: [],
  droppedIds: [],
}

export function isDevFlagId(id: string): id is DevFlagId {
  return Object.hasOwn(SHIPPED_DEV_FLAGS, id)
}

/** The stored text read against `shipped`; no text, or text that is no object, keeps nothing. */
export function readDevFlagOverrides(
  text: string | null,
  shipped: ShippedDevFlags = SHIPPED_DEV_FLAGS,
): DevFlagOverrideReading {
  const stored = parsedObjectOf(text)
  if (stored === null) return NO_DEV_FLAG_OVERRIDES
  return Object.entries(stored).reduce(
    (reading, [id, entry]) => withStoredEntry(reading, id, entry, shipped),
    NO_DEV_FLAG_OVERRIDES,
  )
}

function parsedObjectOf(text: string | null): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function withStoredEntry(
  reading: DevFlagOverrideReading,
  id: string,
  entry: unknown,
  shipped: ShippedDevFlags,
): DevFlagOverrideReading {
  if (!isDevFlagId(id) || !isDevFlagOverride(entry))
    return { ...reading, droppedIds: [...reading.droppedIds, id] }
  if (entry.isOn !== shipped[id])
    return { ...reading, overrides: { ...reading.overrides, [id]: entry } }
  if (entry.defaultWhenSet !== shipped[id])
    return { ...reading, changedDefaults: [...reading.changedDefaults, id] }
  return reading
}

function isDevFlagOverride(entry: unknown): entry is DevFlagOverride {
  return (
    isPlainObject(entry) &&
    typeof entry.isOn === 'boolean' &&
    typeof entry.defaultWhenSet === 'boolean'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * An override kept from a release whose default has flipped since, so it now pins its flag
 * against the new default; the panel shows it as pinned (the #548 ruling).
 */
export function isPinnedAgainstChangedDefault(
  override: DevFlagOverride,
  id: DevFlagId,
  shipped: ShippedDevFlags = SHIPPED_DEV_FLAGS,
): boolean {
  return override.defaultWhenSet !== shipped[id]
}

/** `overrides` with each chosen flag remembered, or dropped where it equals its default. */
export function withChosenDevFlags(
  overrides: DevFlagOverrides,
  choice: DevFlagChoice,
  shipped: ShippedDevFlags = SHIPPED_DEV_FLAGS,
): DevFlagOverrides {
  return Object.entries(choice).reduce<DevFlagOverrides>(
    (kept, [id, isOn]) => withChosenFlag(kept, id as DevFlagId, isOn, shipped),
    overrides,
  )
}

/** Flags a person or a spec sets at once: only the ids named, each to its value. */
export type DevFlagChoice = Readonly<Partial<Record<DevFlagId, boolean>>>

function withChosenFlag(
  overrides: DevFlagOverrides,
  id: DevFlagId,
  isOn: boolean | undefined,
  shipped: ShippedDevFlags,
): DevFlagOverrides {
  const { [id]: _previous, ...rest } = overrides
  if (isOn === undefined || isOn === shipped[id]) return rest
  return { ...rest, [id]: { isOn, defaultWhenSet: shipped[id] } }
}

/** The text to store, or null to remove the item while nothing is overridden. */
export function devFlagOverridesText(overrides: DevFlagOverrides): string | null {
  return Object.keys(overrides).length === 0 ? null : JSON.stringify(overrides)
}

/** The overrides as a choice: each remembered flag at its value. */
export function choiceOfOverrides(overrides: DevFlagOverrides): DevFlagChoice {
  return Object.fromEntries(Object.entries(overrides).map(([id, override]) => [id, override.isOn]))
}
