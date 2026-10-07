/**
 * The command rules `dynamite` registers (feature-slices.md 3.15):
 *
 * - `dynamite.detonate_charge {}`: the plunger (`plunger.ts`). Rejected, changing nothing, while
 *   `remote_detonator` is shut on this planet (`dynamite.detonator_locked`) or the caller has no
 *   live charge (`dynamite.no_live_charge`). Within the interlock it answers
 *   `dynamite.DetonateRefused {in_radius}` and the charge stays live; outside it the kernel blows
 *   the charge as `charge_detonated {by: plunger}`.
 */
import { detonatePlantedCharge } from '../../../systems/authority/charges/chargeDetonation'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import { noPlanetRejection } from '../../../systems/authority/planetOfState'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import type { PlantedCharge } from '../../../systems/vehicle/vehicleCharges'
import './dynamiteEvents'
import { isDetonatorOpen, isWithinInterlock, liveChargeOf } from './plunger'

export const DETONATE_INTENT: CommandIntent<'dynamite.detonate_charge'> = {
  type: 'dynamite.detonate_charge',
  payload: {},
}

export const DYNAMITE_RULES: SliceCommandRules = {
  'dynamite.detonate_charge': {
    fields: {},
    reject: (state, { playerId }) => detonateRejection(state, playerId),
    apply: (state, { playerId, tick }) => pressPlunger(state, playerId, tick),
  },
}

function detonateRejection(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => lockedDetonatorRejection(state),
    () => noLiveChargeRejection(state, playerId),
  ])
}

function lockedDetonatorRejection(state: AuthorityState): Rejection | null {
  if (isDetonatorOpen(state)) return null
  return rejectionOf(
    'dynamite.detonator_locked',
    `remote_detonator is not open on planet ${state.planet.index}`,
  )
}

function noLiveChargeRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (liveChargeOf(state, playerId) !== null) return null
  return rejectionOf('dynamite.no_live_charge', 'no charge is planted')
}

function pressPlunger(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const charge = liveChargeOf(state, playerId) as PlantedCharge
  if (isWithinInterlock(vehicleOf(state, playerId).pose, charge)) return clunk(state, charge)
  return detonatePlantedCharge(state, playerId, tick, 'plunger')
}

function clunk(state: AuthorityState, charge: PlantedCharge): RuleEffect {
  return {
    state,
    events: [{ type: 'dynamite.DetonateRefused', reason: 'in_radius', size: charge.size }],
  }
}
