/**
 * The authority's dev flags as logged state (ticket 547, the TD ruling on #547 and its amendment):
 * the rules read `flagsOf(state)`, the shipped `AUTHORITY_DEV_FLAGS` overlaid with the session's
 * `devFlagDelta`, never the module global, so a flip made by `debug.setFlags` replays, saves and
 * loads like any other input.
 *
 * - The delta holds only the flags that differ from the shipped defaults, and is left out of the
 *   state while empty, so a session nobody flipped digests, saves and snapshots as before.
 * - `devFlagsEverSet` is the sticky taint (VS on #547): written by the first `debug.setFlags` and
 *   kept when the delta goes back to empty, so a run flipped and flipped back still reads as one.
 *   Only a new game drops it.
 */
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'

export type AuthorityFlagId = keyof AuthorityDevFlags

/** The flags that differ from the shipped defaults, each at its value in the session. */
export type DevFlagDelta = Readonly<Partial<Record<AuthorityFlagId, boolean>>>

/** Where the delta and the taint live: the authority state, or a portable copy of it. */
export interface CarriesDevFlags {
  devFlagDelta?: DevFlagDelta
  devFlagsEverSet?: true
}

/** Every authority flag id, in the order `AUTHORITY_DEV_FLAGS` lists them. */
export const AUTHORITY_FLAG_IDS = Object.keys(AUTHORITY_DEV_FLAGS) as readonly AuthorityFlagId[]

/** The flags the session's rules run with: the shipped defaults, overlaid with its delta. */
export function flagsOf(state: CarriesDevFlags): AuthorityDevFlags {
  const delta = state.devFlagDelta
  return delta === undefined ? AUTHORITY_DEV_FLAGS : { ...AUTHORITY_DEV_FLAGS, ...delta }
}

/** The entries of `flags` that differ from the shipped defaults, in flag id order. */
export function deltaOfFlags(flags: AuthorityDevFlags): DevFlagDelta {
  return Object.fromEntries(
    AUTHORITY_FLAG_IDS.filter((id) => flags[id] !== AUTHORITY_DEV_FLAGS[id]).map((id) => [
      id,
      flags[id],
    ]),
  )
}

/** The delta under its key, or no key at all while it is empty. */
export function devFlagDeltaField(delta: DevFlagDelta | undefined): {
  devFlagDelta?: DevFlagDelta
} {
  return delta === undefined || Object.keys(delta).length === 0
    ? {}
    : { devFlagDelta: { ...delta } }
}

/** The taint under its key, or no key at all before the first `debug.setFlags`. */
export function devFlagsEverSetField(isEverSet: boolean | undefined): { devFlagsEverSet?: true } {
  return isEverSet === true ? { devFlagsEverSet: true } : {}
}

/** Both fields as `state` carries them, for the snapshot and the save to copy. */
export function devFlagFieldsOf(state: CarriesDevFlags): CarriesDevFlags {
  return {
    ...devFlagDeltaField(state.devFlagDelta),
    ...devFlagsEverSetField(state.devFlagsEverSet),
  }
}

/** A run is tainted once any flag was ever set in it, whatever its delta reads now. */
export function isDevFlagTainted(state: CarriesDevFlags): boolean {
  return (
    state.devFlagsEverSet === true ||
    devFlagDeltaField(state.devFlagDelta).devFlagDelta !== undefined
  )
}

export function isAuthorityFlagId(id: string): id is AuthorityFlagId {
  return Object.hasOwn(AUTHORITY_DEV_FLAGS, id)
}

/** Why a portable copy's fields cannot be restored; none when both are absent or well formed. */
export function portableDevFlagProblems(state: Record<string, unknown>, path: string): string[] {
  return [
    ...deltaProblems(state.devFlagDelta, `${path}.devFlagDelta`),
    ...(state.devFlagsEverSet === undefined || state.devFlagsEverSet === true
      ? []
      : [`${path}.devFlagsEverSet must be true, or be left out`]),
  ]
}

function deltaProblems(delta: unknown, path: string): string[] {
  if (delta === undefined) return []
  if (!isFlagObject(delta)) return [`${path} must be an object of flag ids and booleans`]
  return Object.entries(delta).flatMap(([id, value]) => deltaEntryProblems(id, value, path))
}

function deltaEntryProblems(id: string, value: unknown, path: string): string[] {
  if (!isAuthorityFlagId(id)) return [`${path} names "${id}", not an authority dev flag`]
  return typeof value === 'boolean' ? [] : [`${path}.${id} must be true or false`]
}

function isFlagObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `state` with `delta` as its flags off their defaults, and marked as ever set (ticket 547). */
export function withDevFlagDelta<S extends CarriesDevFlags>(state: S, delta: DevFlagDelta): S {
  const { devFlagDelta: _previous, ...rest } = state
  return { ...rest, ...devFlagDeltaField(delta), devFlagsEverSet: true } as S
}
