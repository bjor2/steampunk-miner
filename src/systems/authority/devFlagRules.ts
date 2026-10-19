/**
 * `debug.setFlags` (ticket 547, the TD ruling on #547 and its amendment): the one writer of the
 * session's dev flags. A logged, tick-stamped debug command, so a flip replays at its tick and a
 * snapshot or save after it restores the flags it left.
 *
 * - Each flag the payload names takes its value; the rest keep theirs. The session keeps only the
 *   flags off their shipped defaults (`devFlagState.ts`) and the sticky taint.
 * - Flags, never numbers (VS 6): an id the authority has no flag for is refused `unknown_flag`.
 * - A shared session's world rules are the host's (VS 2): anyone else is refused
 *   `not_session_host`, logged like every refusal.
 * - Zero on flip to on (the amendment's decision 1): a flag going from off to on drops the carries
 *   its on path consumes and its off path leaves standing, on every vehicle, so no work from
 *   before the flip is ever charged or heated after it.
 * - A flip writes nothing else: no unlock, ore first, artefact or codex record (HS a), and every
 *   gate check stays whatever the flags (HS c).
 */
import type { AuthorityDevFlags } from '../../constants/devFlags'
import { withoutCutEnergyCarry } from '../vehicle/cutCarry'
import type { VehicleState } from '../vehicle/vehicleState'
import type { AuthorityState, PlayerState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import {
  AUTHORITY_FLAG_IDS,
  deltaOfFlags,
  flagsOf,
  isAuthorityFlagId,
  withDevFlagDelta,
  type AuthorityFlagId,
} from './devFlagState'
import { isSessionHost } from './sessionHost'

/** A carry integer a flag's on path consumes and its off path leaves as it is. */
type FlagCarry = 'cutEnergyCarry' | 'cutHeatCarry' | 'sweptCarrySubSteps'

/**
 * The carries each flag's on path reads: the exact carry charges and heats from both report
 * carries; the swept law charge pays from the energy carry and walks the swept cursor's carried
 * work; uncapped heat holds whole drill ticks on the heat carry. The rest read no carry.
 */
const CARRIES_OF_FLAG: Readonly<Record<AuthorityFlagId, readonly FlagCarry[]>> = {
  'enemy.lureRetarget': [],
  'drill.exactCarry': ['cutEnergyCarry', 'cutHeatCarry'],
  'drill.sweptLawCharge': ['cutEnergyCarry', 'sweptCarrySubSteps'],
  'drill.reportCapsule': [],
  'heat.workUncapped': ['cutHeatCarry'],
  'codex.materialContact': [],
}

export const DEV_FLAG_DEBUG_RULES: { readonly 'debug.setFlags': CommandRule<'debug.setFlags'> } = {
  'debug.setFlags': {
    fields: { delta: 'flagMap' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => unknownFlagRejection(payload.delta),
        () => hostRejection(state, playerId),
      ]),
    apply: (state, { payload }) => setDevFlags(state, payload.delta),
  },
}

function unknownFlagRejection(delta: Readonly<Record<string, boolean>>): Rejection | null {
  const unknown = Object.keys(delta).filter((id) => !isAuthorityFlagId(id))
  if (unknown.length === 0) return null
  return {
    reason: 'unknown_flag',
    problems: unknown.map((id) => `"${id}" is not an authority dev flag`),
  }
}

function hostRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (isSessionHost(state, playerId)) return null
  return rejectionOf(
    'not_session_host',
    `only the session's host sets its dev flags, not "${playerId}"`,
  )
}

function setDevFlags(state: AuthorityState, delta: Readonly<Record<string, boolean>>): RuleEffect {
  const before = flagsOf(state)
  const after: AuthorityDevFlags = { ...before, ...delta }
  const zeroed = withCarriesDropped(state, carriesTurnedOnBy(before, after))
  const kept = deltaOfFlags(after)
  return { state: withDevFlagDelta(zeroed, kept), events: [{ type: 'DevFlagsSet', delta: kept }] }
}

/** The carries of every flag that goes from off to on. */
function carriesTurnedOnBy(before: AuthorityDevFlags, after: AuthorityDevFlags): Set<FlagCarry> {
  const turnedOn = AUTHORITY_FLAG_IDS.filter((id) => !before[id] && after[id])
  return new Set(turnedOn.flatMap((id) => CARRIES_OF_FLAG[id]))
}

function withCarriesDropped(state: AuthorityState, carries: Set<FlagCarry>): AuthorityState {
  if (carries.size === 0) return state
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      playerWithCarriesDropped(player, carries),
    ]),
  )
  return { ...state, players }
}

function playerWithCarriesDropped(player: PlayerState, carries: Set<FlagCarry>): PlayerState {
  return { ...player, vehicle: vehicleWithCarriesDropped(player.vehicle, carries) }
}

/** Each carry left out (the report carries are absent at 0) or, on the swept cursor, at 0. */
const DROP_CARRY: Readonly<Record<FlagCarry, (vehicle: VehicleState) => VehicleState>> = {
  cutEnergyCarry: (vehicle) => withoutCutEnergyCarry(vehicle),
  cutHeatCarry: ({ cutHeatCarry: _dropped, ...vehicle }) => vehicle,
  sweptCarrySubSteps: (vehicle) =>
    vehicle.sweptCut === undefined
      ? vehicle
      : { ...vehicle, sweptCut: { ...vehicle.sweptCut, carrySubSteps: 0 } },
}

function vehicleWithCarriesDropped(vehicle: VehicleState, carries: Set<FlagCarry>): VehicleState {
  return [...carries].reduce((dropped, carry) => DROP_CARRY[carry](dropped), vehicle)
}
