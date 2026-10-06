/**
 * Docking and undocking (decision #8, #7 state machine, #23 acceptance 1 and 2):
 *
 *   active -- Dock, stationary in the pad zone -->  docked   vehicle_state_changed, dock_entered
 *   docked -- Undock -->                            active   dock_left, vehicle_state_changed
 *
 * The platform has two bays (#37), each with its own pad zone: `Dock {bay}` docks in the bay the
 * vehicle stands in, and a docked vehicle's bay is the one its pose is in, so it needs no field of
 * its own. Each platform command belongs to one bay; at the other it is refused with `wrong_bay`.
 * There is no undock grace: right after `Undock`, a vehicle still at rest in the pad zone may dock
 * again at once (#58, #40 follow-up).
 *
 * Docking banks the carried core fragments (#10), ends the trip for combat (the vehicle's enemies
 * leave and used spawn points free up, #9), readies a spent `breathing_room` brace (#46) and
 * takes a `dock` state digest (#11 section 3).
 * A vehicle with energy 0 in the pad zone is still `active` (it never strands there, #7), so it
 * docks like any other: no tow, no fee.
 */
import { toCanonical } from '../money'
import { bayOfPose, isInBayZone, isPoseStationary, type VehiclePose } from '../vehicle/vehiclePose'
import { cargoUnitsOf, isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import { BAY_IDS, hasBay, type BayId } from '../world/dockBays'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { restoreBreathingRoom } from './artefactRules'
import { endTrip } from './combat/enemyRoster'
import { bankCoreFragments } from './coreBay'
import { dockSiteOfPlanet, noPlanetRejection } from './planetOfState'
import { stateDigest } from './stateDigest'
import { changeMode } from './vehicleTransitions'

export const DOCK_COMMAND_RULES: {
  readonly dock: CommandRule<'dock'>
  readonly undock: CommandRule<'undock'>
} = {
  dock: {
    fields: { bay: 'bay' },
    reject: (state, { playerId, payload }) => dockRefusal(state, playerId, payload.bay),
    apply: (state, { playerId, tick, payload }) =>
      chainEffects(state, [
        (current) => changeMode(current, playerId, 'docked', 'dock', tick),
        (current) => logDockEntry(current, playerId, payload.bay),
        (current) => bankCoreFragments(current, playerId, 'dock', tick),
        (current) => endTrip(current, playerId),
        (current) => restoreBreathingRoom(current, playerId),
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

/** Why `Dock {bay}` would be refused now; null when the vehicle may dock there (#33 `canDock`). */
export function dockRefusal(state: AuthorityState, playerId: string, bay: BayId): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => missingBayRejection(state, bay),
    () => activeRejection(vehicle),
    () => bayZoneRejection(state, bay, vehicle.pose),
  ])
}

/** The Refinery bay is on the pad only from its unlock planet (#105). */
export function missingBayRejection(state: AuthorityState, bay: BayId): Rejection | null {
  const site = dockSiteOfPlanet(state.planet)
  if (site === null || hasBay(site, bay)) return null
  return rejectionOf(
    'refinery_locked',
    `the platform has no ${bay} bay on planet ${state.planet.index}`,
  )
}

export function canDock(state: AuthorityState, playerId: string, bay: BayId): boolean {
  return dockRefusal(state, playerId, bay) === null
}

/** The bay the vehicle may dock at now (the dock prompt and `interact`, #40), or null. */
export function dockableBayOf(state: AuthorityState, playerId: string): BayId | null {
  return BAY_IDS.find((bay) => canDock(state, playerId, bay)) ?? null
}

/** The bay a docked vehicle stands in; null while it is not docked. */
export function dockedBayOf(state: AuthorityState, playerId: string): BayId | null {
  const vehicle = vehicleOf(state, playerId)
  const site = dockSiteOfPlanet(state.planet)
  if (vehicle.mode !== 'docked' || site === null || vehicle.pose === null) return null
  return bayOfPose(site, vehicle.pose)
}

/** The platform's facilities serve a docked vehicle only. */
export function notDockedRejection(vehicle: VehicleState): Rejection | null {
  if (vehicle.mode === 'docked') return null
  return rejectionOf('not_docked', `the vehicle is ${vehicle.mode}, not docked`)
}

/** A bay's command (#37): refused when not docked, and with `wrong_bay` at the other bay. */
export function atBayRejection(
  state: AuthorityState,
  playerId: string,
  bay: BayId,
): Rejection | null {
  return firstRejection([
    () => notDockedRejection(vehicleOf(state, playerId)),
    () => wrongBayRejection(dockedBayOf(state, playerId), bay),
  ])
}

function wrongBayRejection(docked: BayId | null, required: BayId): Rejection | null {
  if (docked === required) return null
  return rejectionOf(
    'wrong_bay',
    `only at the ${required} bay; the vehicle is at ${docked ?? 'no bay'}`,
  )
}

function activeRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function bayZoneRejection(
  state: AuthorityState,
  bay: BayId,
  pose: VehiclePose | null,
): Rejection | null {
  const site = dockSiteOfPlanet(state.planet)
  if (site === null || pose === null || !isInBayZone(site, bay, pose)) {
    return rejectionOf('not_docked', `the vehicle is not in the ${bay} bay's pad zone`)
  }
  if (!isPoseStationary(pose)) return rejectionOf('not_docked', 'the vehicle is still moving')
  return null
}

/** What the vehicle brought home, before the bay takes its core (#23 acceptance 1). */
function logDockEntry(state: AuthorityState, playerId: string, bay: BayId): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  return {
    state,
    events: [
      {
        type: 'DockEntered',
        bay,
        cargoUnits: cargoUnitsOf(vehicle.cargo),
        energy: vehicle.energy,
        hull: toCanonical(vehicle.hull),
      },
    ],
  }
}

/** A vehicle docked off both bays (never by these rules) says `sell`, where the tow lands. */
function logDockExit(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const durationTicks = tick - vehicleOf(state, playerId).modeSinceTick
  const bay = dockedBayOf(state, playerId) ?? 'sell'
  return { state, events: [{ type: 'DockLeft', bay, durationTicks }] }
}

/** The first pose report after `Undock` counts its action ticks from the undock (#11). */
function restartActionAccounting(state: AuthorityState, playerId: string, tick: number) {
  const vehicle = vehicleOf(state, playerId)
  return { state: withVehicle(state, playerId, { ...vehicle, accountedTick: tick }), events: [] }
}

function digestAtDock(state: AuthorityState): RuleEffect {
  return { state, events: [{ type: 'StateDigested', digest: stateDigest(state), scope: 'dock' }] }
}
