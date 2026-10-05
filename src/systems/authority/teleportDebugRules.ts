/**
 * `teleportToDock()` (design doc section 19, decision #11 section 5) as the `debug.*` command
 * `debug.teleportToDock`: the vehicle is put on the dock point and docks there exactly as the
 * `Dock` command docks it (core banked, trip ended, dock digest), with no tow and no fee. It goes
 * through `applyCommand`, so it replays and logs `debug_command_applied`. A docked vehicle has
 * nowhere to go, and a destroyed one waits for its tow: both are refused with a listed problem.
 */
import { dockedPoseAt } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
} from './commandRule'
import { DOCK_COMMAND_RULES } from './dockRules'
import { dockSiteOfPlanet, noPlanetRejection } from './planetOfState'

export const TELEPORT_DEBUG_RULES: {
  readonly 'debug.teleportToDock': CommandRule<'debug.teleportToDock'>
} = {
  'debug.teleportToDock': {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => movableRejection(vehicleOf(state, playerId)),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => unchanged(placeOnDockPoint(current, command.playerId)),
        (current) => DOCK_COMMAND_RULES.dock.apply(current, { ...command, type: 'dock' }),
      ]),
  },
}

function movableRejection(vehicle: VehicleState): Rejection | null {
  if (vehicle.mode === 'docked')
    return rejectionOf('vehicle_not_active', 'the vehicle is already docked')
  if (vehicle.mode === 'destroyed') {
    return rejectionOf('vehicle_not_active', 'the vehicle is destroyed; its tow is on the way')
  }
  return null
}

/** A stranded vehicle comes home active, so it docks like any other. */
function placeOnDockPoint(state: AuthorityState, playerId: string): AuthorityState {
  const site = dockSiteOfPlanet(state.planet)
  const vehicle = vehicleOf(state, playerId)
  const pose = site === null ? vehicle.pose : dockedPoseAt(site)
  return withVehicle(state, playerId, { ...vehicle, mode: 'active', pose })
}
