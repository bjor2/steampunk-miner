/**
 * `teleportToDock(bay)` (design doc section 19, decision #11 section 5, #37) as the `debug.*`
 * command `debug.teleportToDock {bay}`: the vehicle is put at rest in that bay and docks there
 * exactly as the `Dock` command docks it (core banked, trip ended, dock digest), with no tow and no fee. It goes
 * through `applyCommand`, so it replays and logs `debug_command_applied`. A docked vehicle has
 * nowhere to go, and a destroyed one waits for its tow: both are refused with a listed problem.
 */
import { bayPoseAt } from '../vehicle/vehiclePose'
import type { BayId } from '../world/dockBays'
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
import { DOCK_COMMAND_RULES, missingBayRejection } from './dockRules'
import { dockSiteOfPlanet, noPlanetRejection } from './planetOfState'

export const TELEPORT_DEBUG_RULES: {
  readonly 'debug.teleportToDock': CommandRule<'debug.teleportToDock'>
} = {
  'debug.teleportToDock': {
    fields: { bay: 'bay' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => missingBayRejection(state, payload.bay),
        () => movableRejection(vehicleOf(state, playerId)),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => unchanged(placeInBay(current, command.playerId, command.payload.bay)),
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
function placeInBay(state: AuthorityState, playerId: string, bay: BayId): AuthorityState {
  const site = dockSiteOfPlanet(state.planet)
  const vehicle = vehicleOf(state, playerId)
  const pose = site === null ? vehicle.pose : bayPoseAt(site, bay)
  return withVehicle(state, playerId, { ...vehicle, mode: 'active', pose })
}
