/**
 * Each player's sounding whistle (the `aetheric` save section v1, #262): the cell it sounded on,
 * how far it is heard and the tick it falls silent, kept in the authority so every machine lures the
 * same hunters (design principle 37.6). A new blow replaces the old one; the lure clock clears it
 * the tick it ends, so the section goes back to its initial value, out of the state and the
 * digest, once nothing sounds. Every field is a safe integer, so the portable form is the value.
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

export interface WhistleState {
  sounding: SoundingWhistle | null
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

const WHISTLE_FIELDS = ['tx', 'ty', 'reachMm', 'untilTick'] as const

function whistleStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['aetheric must be an object']
  if (body.sounding === null) return []
  if (!isJsonObject(body.sounding)) return ['aetheric.sounding must be an object or null']
  const sounding = body.sounding
  return WHISTLE_FIELDS.filter((field) => !Number.isSafeInteger(sounding[field])).map(
    (field) => `aetheric.sounding.${field} must be a safe integer`,
  )
}
