/**
 * Each player's sounding whistle (the `aetheric` save section v1, #262): the cell it sounded on,
 * how far it is heard and the tick it falls silent, kept in the authority so every machine lures the
 * same hunters (design principle 37.6). A new blow replaces the old one; the lure clock clears it
 * the tick it ends, so the section goes back to its initial value, out of the state and the
 * digest, once nothing sounds. The warning chime (ticket 373) keeps the tile it asked a pressed
 * whistle to sound on beside it until that whistle acts. Every field is a safe integer, so the
 * portable form is the value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

/** A whistle sounding on tile (`tx`, `ty`) until `untilTick`, heard within `reachMm`. */
export interface SoundingWhistle {
  tx: number
  ty: number
  reachMm: number
  untilTick: number
}

/**
 * Where the warning chime (ticket 373) asked the whistle it pressed on `pressTick` to sound: the
 * tile of the enemy the periscope sighted, in place of the vehicle's.
 */
export interface ChimeTarget {
  tx: number
  ty: number
  pressTick: number
}

export interface WhistleState {
  sounding: SoundingWhistle | null
  /** Absent unless the warning chime pressed the whistle, so no save or digest changes without it. */
  chime?: ChimeTarget
}

export const SILENT: WhistleState = { sounding: null }

export const AETHERIC_SECTION: SaveSection<WhistleState> = {
  id: 'aetheric',
  version: 1,
  scope: 'player',
  initial: SILENT,
  problems: whistleStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as WhistleState,
}

export function whistleOf(state: AuthorityState, playerId: string): WhistleState {
  return readSection(state, playerId, AETHERIC_SECTION)
}

export function withWhistle(
  state: AuthorityState,
  playerId: string,
  whistle: WhistleState,
): AuthorityState {
  return withSection(state, playerId, AETHERIC_SECTION, whistle)
}

/** The state with its sounding cleared and any chime target kept. */
export function withoutSounding(whistle: WhistleState): WhistleState {
  return whistle.chime === undefined ? SILENT : { sounding: null, chime: whistle.chime }
}

/** The state with its chime target dropped. */
export function withoutChime(whistle: WhistleState): WhistleState {
  return { sounding: whistle.sounding }
}

const WHISTLE_FIELDS = ['tx', 'ty', 'reachMm', 'untilTick'] as const
const CHIME_FIELDS = ['tx', 'ty', 'pressTick'] as const

function whistleStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['aetheric must be an object']
  return [...soundingProblems(body.sounding), ...chimeProblems(body.chime)]
}

function soundingProblems(sounding: unknown): string[] {
  if (sounding === null) return []
  if (!isJsonObject(sounding)) return ['aetheric.sounding must be an object or null']
  return WHISTLE_FIELDS.filter((field) => !Number.isSafeInteger(sounding[field])).map(
    (field) => `aetheric.sounding.${field} must be a safe integer`,
  )
}

function chimeProblems(chime: unknown): string[] {
  if (chime === undefined) return []
  if (!isJsonObject(chime)) return ['aetheric.chime must be an object']
  return CHIME_FIELDS.filter((field) => !Number.isSafeInteger(chime[field])).map(
    (field) => `aetheric.chime.${field} must be a safe integer`,
  )
}
