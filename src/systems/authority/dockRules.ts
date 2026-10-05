/**
 * Docking and undocking (decision #8, #7 state machine, #23 acceptance 1 and 2):
 *
 *   active -- Dock, stationary in the pad zone -->  docked   vehicle_state_changed, dock_entered
 *   docked -- Undock -->                            active   dock_left, vehicle_state_changed
 *
 * Docking banks the carried core fragments (#10) and takes a `dock` state digest (#11 section 3).
 * A vehicle with energy 0 in the pad zone is still `active` (it never strands there, #7), so it
 * docks like any other: no tow, no fee.
 */
import { DOCK_STATIONARY_MM_PER_SECOND } from '../../constants/balance'
import { toCanonical } from '../money'
import { isInPadZone, type VehiclePose } from '../vehicle/vehiclePose'
import { cargoUnitsOf, isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { bankCoreFragments } from './coreBay'
import { dockSiteOfPlanet, noPlanetRejection } from './planetOfState'
import { stateDigest } from './stateDigest'
import { changeMode } from './vehicleTransitions'

export const DOCK_COMMAND_RULES: {
  readonly dock: CommandRule<'dock'>
  readonly undock: CommandRule<'undock'>
} = {
  dock: {
    fields: {},
    reject: (state, { playerId }) => dockRefusal(state, playerId),
    apply: (state, { playerId, tick }) =>
      chainEffects(state, [
        (current) => changeMode(current, playerId, 'docked', 'dock', tick),
        (current) => logDockEntry(current, playerId),
        (current) => bankCoreFragments(current, playerId, 'dock'),
        (current) => digestAtDock(current),
      ]),
  },
  undock: {
    fields: {},
    reject: (state, { playerId }) => notDockedRejection(vehicleOf(state, playerId)),
    apply: (state, { playerId, tick }) =>
      chainEffects(state, [
        (current) => logDockExit(current, playerId, tick),
        (current) => changeMode(current, playerId, 'active', 'undock', tick),
        (current) => restartActionAccounting(current, playerId, tick),
      ]),
  },
}

/** Why `Dock` would be refused now; null when the vehicle may dock (#33 `canDock`). */
export function dockRefusal(state: AuthorityState, playerId: string): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => activeRejection(vehicle),
    () => padZoneRejection(state, vehicle.pose),
  ])
}

export function canDock(state: AuthorityState, playerId: string): boolean {
  return dockRefusal(state, playerId) === null
}

/** The platform's facilities serve a docked vehicle only. */
export function notDockedRejection(vehicle: VehicleState): Rejection | null {
  if (vehicle.mode === 'docked') return null
  return rejectionOf('not_docked', `the vehicle is ${vehicle.mode}, not docked`)
}

function activeRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function padZoneRejection(state: AuthorityState, pose: VehiclePose | null): Rejection | null {
  const site = dockSiteOfPlanet(state.planet)
  if (site === null || pose === null || !isInPadZone(site, pose)) {
    return rejectionOf('not_docked', 'the vehicle is not in the pad zone')
  }
  if (!isStationary(pose)) return rejectionOf('not_docked', 'the vehicle is still moving')
  return null
}

function isStationary(pose: VehiclePose): boolean {
  return (
    Math.abs(pose.vx) <= DOCK_STATIONARY_MM_PER_SECOND &&
    Math.abs(pose.vy) <= DOCK_STATIONARY_MM_PER_SECOND
  )
}

/** What the vehicle brought home, before the bay takes its core (#23 acceptance 1). */
function logDockEntry(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  return {
    state,
    events: [
      {
        type: 'DockEntered',
        cargoUnits: cargoUnitsOf(vehicle.cargo),
        energy: vehicle.energy,
        hull: toCanonical(vehicle.hull),
      },
    ],
  }
}

function logDockExit(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const durationTicks = tick - vehicleOf(state, playerId).modeSinceTick
  return { state, events: [{ type: 'DockLeft', durationTicks }] }
}

/** The first pose report after `Undock` counts its action ticks from the undock (#11). */
function restartActionAccounting(state: AuthorityState, playerId: string, tick: number) {
  const vehicle = vehicleOf(state, playerId)
  return { state: withVehicle(state, playerId, { ...vehicle, accountedTick: tick }), events: [] }
}

function digestAtDock(state: AuthorityState): RuleEffect {
  return { state, events: [{ type: 'StateDigested', digest: stateDigest(state), scope: 'dock' }] }
}
