/**
 * Each player's phase under way (the `aetheric.phase` save section v1, #261): the cell the lantern
 * phases the vehicle through, the cell it set out from, the cell it lands in and the ticks of the
 * move, kept in the authority so every machine steers the same move (design principle 37.6). A
 * reversed phase swaps its start and landing cells and says so; the phase clock clears the record
 * the tick the move ends, so the section goes back to its initial value, out of the state and the
 * digest, once nothing phases. Every number is a safe integer, so the portable form is the value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

/**
 * A move from the centre of (`fromTx`, `fromTy`) through cell (`cellTx`, `cellTy`) to the centre
 * of (`toTx`, `toTy`), under way from `startTick` and over at `endTick`; `isReturning` once the
 * landing cell closed and the move turned back toward the start cell.
 */
export interface PhaseMove {
  fromTx: number
  fromTy: number
  cellTx: number
  cellTy: number
  toTx: number
  toTy: number
  startTick: number
  endTick: number
  isReturning: boolean
}

export interface PhaseState {
  phase: PhaseMove | null
}

export const NOT_PHASING: PhaseState = { phase: null }

export const PHASE_SECTION: SaveSection<PhaseState> = {
  id: 'aetheric.phase',
  version: 1,
  scope: 'player',
  initial: NOT_PHASING,
  problems: phaseStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as PhaseState,
}

export function phaseOf(state: AuthorityState, playerId: string): PhaseState {
  return readSection(state, playerId, PHASE_SECTION)
}

export function withPhase(
  state: AuthorityState,
  playerId: string,
  phase: PhaseState,
): AuthorityState {
  return withSection(state, playerId, PHASE_SECTION, phase)
}

const PHASE_FIELDS = [
  'fromTx',
  'fromTy',
  'cellTx',
  'cellTy',
  'toTx',
  'toTy',
  'startTick',
  'endTick',
] as const

function phaseStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['aetheric.phase must be an object']
  if (body.phase === null) return []
  if (!isJsonObject(body.phase)) return ['aetheric.phase.phase must be an object or null']
  const phase = body.phase
  return [
    ...PHASE_FIELDS.filter((field) => !Number.isSafeInteger(phase[field])).map(
      (field) => `aetheric.phase.phase.${field} must be a safe integer`,
    ),
    ...(typeof phase.isReturning === 'boolean'
      ? []
      : ['aetheric.phase.phase.isReturning must be a boolean']),
  ]
}
