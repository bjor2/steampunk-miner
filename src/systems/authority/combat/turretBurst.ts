/**
 * `turret.burst {on}`, Overpressure's held toggle (K-burst, ticket 383; the TD lock on #319). The
 * server owns it: on, the vehicle's guns run the turret shape's `burst` cycle (`gunBurst.ts`), the
 * cycle read once here as the toggle goes on; off, they vent out what is due. #273's
 * `hold_power_up` does not fit: it is power-up-core's command for a Marked slot's follow-up, and
 * the kernel's guns cannot read a slice.
 *
 * Refused `no_guns` with no guns mounted and `no_burst` while the turret's shape has no burst. A
 * switch that changes nothing is accepted quietly; a real one answers `TurretBurstSet`.
 */
import { isGunMounted } from '../../vehicle/vehicleGun'
import { isBurstOn, switchedOffBurst, switchedOnBurst, type GunBurst } from '../../vehicle/gunBurst'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { turretShapeOf } from './turretShape'

export const TURRET_BURST_RULES: { readonly 'turret.burst': CommandRule<'turret.burst'> } = {
  'turret.burst': {
    fields: { on: 'flag' },
    reject: (state, { playerId, payload }) => (payload.on ? burstOnRefusal(state, playerId) : null),
    apply: (state, { playerId, payload, tick }) =>
      payload.on ? switchBurstOn(state, playerId, tick) : switchBurstOff(state, playerId, tick),
  },
}

function burstOnRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => noGunsRejection(state, playerId),
    () => noBurstRejection(state, playerId),
  ])
}

function noGunsRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (isGunMounted(vehicleOf(state, playerId).gun)) return null
  return rejectionOf('no_guns', 'the vehicle has no guns to burst')
}

function noBurstRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (turretShapeOf(state, playerId).burst !== null) return null
  return rejectionOf('no_burst', "the turret's shape has no Overpressure burst")
}

function switchBurstOn(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const { gunBurst } = vehicleOf(state, playerId)
  const cycle = turretShapeOf(state, playerId).burst
  if (isBurstOn(gunBurst) || cycle === null) return unchanged(state)
  return switchedTo(state, playerId, switchedOnBurst(gunBurst, cycle, tick))
}

function switchBurstOff(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const { gunBurst } = vehicleOf(state, playerId)
  if (gunBurst === undefined || !isBurstOn(gunBurst)) return unchanged(state)
  return switchedTo(state, playerId, switchedOffBurst(gunBurst, tick))
}

function switchedTo(state: AuthorityState, playerId: string, gunBurst: GunBurst): RuleEffect {
  const switched = withVehicle(state, playerId, { ...vehicleOf(state, playerId), gunBurst })
  return { state: switched, events: [{ type: 'TurretBurstSet', isOn: isBurstOn(gunBurst) }] }
}
