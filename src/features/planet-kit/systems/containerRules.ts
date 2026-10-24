/**
 * The Cache Crate's host commands (ticket 823; the TD's final ruling on #823, points 2, 3, 5 and
 * 6), answered by the authority so every player sees one world:
 *
 * - `planet-kit.drop_container {kind}`: the whole hold moves into a new container at the
 *   vehicle's cell on this planet. Refused, costing nothing, for a kind with no cap row, a vehicle
 *   out of play, an empty hold, or a drop past the kind's cap per player per planet.
 * - `planet-kit.pickup_container {containerId}`: the container's cargo moves back into the hold,
 *   up to its free room, highest first; what does not fit stays and an emptied container goes.
 *   Refused for a container not on this planet, one the player may not open (only its owner while
 *   access is `owner`), one out of the drill's reach of the vehicle, or a full hold.
 * - `debug.planet-kit.placeContainer`: a scenario's container with given cargo, refused (never
 *   trimmed) as a drop would be, or for cargo that is not whole units per tier.
 *
 * Spending the carried crate waits for the owned/stack section of #850; until then no control
 * sends a drop, only the scenario call and a spec do.
 */
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import type { RejectionReason } from '../../../systems/authority/domainEvent'
import type { CommandPayloads } from '../../../systems/authority/authorityCommand'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import {
  isWithinDrillReach,
  tileOfPose,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import {
  isVehicleActive,
  statsOfVehicle,
  type Cargo,
  type VehicleState,
} from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { containerDroppedOf, containerPickedUpOf } from './containerEvents'
import { placedContainersIn, sessionPlanetKeyOf, withPlacedContainers } from './containerSection'
import {
  containerAt,
  dropContainer,
  dropRefusalOf,
  pickupContainer,
  pickupRefusalOf,
  type ContainerDrop,
  type ContainerPickup,
  type PlacedContainer,
} from './placedContainers'
import { PLANET_KIT_ECONOMY } from './planetKitRows'
import { scenarioCargoOf, scenarioCargoProblems } from './scenarioCargo'

type ScenarioContainer = CommandPayloads['debug.planet-kit.placeContainer']

export const CONTAINER_RULES: SliceCommandRules = {
  'planet-kit.drop_container': {
    fields: { kind: 'text' },
    reject: (state, { playerId, payload }) => dropRejectionOf(state, playerId, payload.kind),
    apply: (state, { playerId, payload }) =>
      placeContainer(state, playerId, holdDropOf(state, playerId, payload.kind)),
  },
  'planet-kit.pickup_container': {
    fields: { containerId: 'wholeNumber' },
    reject: (state, { playerId, payload }) =>
      pickupRejectionOf(state, playerId, payload.containerId),
    apply: (state, { playerId, payload }) =>
      takeFromContainer(state, playerId, pickupOf(state, playerId, payload.containerId)),
  },
  'debug.planet-kit.placeContainer': {
    fields: {
      kind: 'text',
      ownerId: 'text',
      tx: 'safeInteger',
      ty: 'safeInteger',
      ore: 'textMap',
      coreFragments: 'wholeNumber',
    },
    reject: (state, { payload }) =>
      firstRejection([
        () => unknownKindRejection(payload.kind),
        () => badCargoRejection(payload.ore, payload.ownerId),
        () => dropRejection(state, scenarioDropOf(state, payload)),
      ]),
    apply: (state, { payload }) => ({
      state: withDropped(state, scenarioDropOf(state, payload)),
      events: [],
    }),
  },
}

/** The intent a drop control sends (#850 wires one once a crate can be carried). */
export function dropContainerIntent(kind: string) {
  return { type: 'planet-kit.drop_container' as const, payload: { kind } }
}

/** The intent the container list's pickup sends. */
export function pickupContainerIntent(containerId: number) {
  return { type: 'planet-kit.pickup_container' as const, payload: { containerId } }
}

/** Why dropping the hold as a `kind` would be refused now; null when it would land. */
export function dropRejectionOf(
  state: AuthorityState,
  playerId: string,
  kind: string,
): Rejection | null {
  return firstRejection([
    () => unknownKindRejection(kind),
    () => outOfPlayRejection(vehicleOf(state, playerId)),
    () => dropRejection(state, holdDropOf(state, playerId, kind)),
  ])
}

/** Why picking up `containerId` would be refused now; null when it would move cargo. */
export function pickupRejectionOf(
  state: AuthorityState,
  playerId: string,
  containerId: number,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => outOfPlayRejection(vehicle),
    () => pickupRefusalRejection(state, pickupOf(state, playerId, containerId)),
    () => reachRejection(vehicle, containerOnPlanet(state, containerId)),
  ])
}

function placeContainer(state: AuthorityState, playerId: string, drop: ContainerDrop): RuleEffect {
  const outcome = dropContainer(placedContainersIn(state), drop)
  if (!outcome.isDropped) return { state, events: [] }
  const placed = withPlacedContainers(state, outcome.placed)
  return {
    state: withHold(placed, playerId, outcome.hold),
    events: [containerDroppedOf(playerId, drop.planetKey, outcome.container)],
  }
}

function withDropped(state: AuthorityState, drop: ContainerDrop): AuthorityState {
  const outcome = dropContainer(placedContainersIn(state), drop)
  return outcome.isDropped ? withPlacedContainers(state, outcome.placed) : state
}

function takeFromContainer(
  state: AuthorityState,
  playerId: string,
  pickup: ContainerPickup,
): RuleEffect {
  const container = containerOnPlanet(state, pickup.containerId) as PlacedContainer
  const outcome = pickupContainer(placedContainersIn(state), pickup)
  if (!outcome.isPickedUp) return { state, events: [] }
  const placed = withPlacedContainers(state, outcome.placed)
  return {
    state: withHold(placed, playerId, outcome.hold),
    events: [containerPickedUpOf(playerId, pickup.planetKey, container, outcome.moved)],
  }
}

function holdDropOf(state: AuthorityState, playerId: string, kind: string): ContainerDrop {
  const vehicle = vehicleOf(state, playerId)
  return {
    ...dropBaseOf(state, kind, playerId),
    // Read only once `outOfPlayRejection` passed, so the vehicle has a pose.
    cell: tileOfPose(vehicle.pose as VehiclePose),
    hold: vehicle.cargo,
  }
}

function scenarioDropOf(state: AuthorityState, payload: ScenarioContainer): ContainerDrop {
  return {
    ...dropBaseOf(state, payload.kind, payload.ownerId),
    cell: { tx: payload.tx, ty: payload.ty },
    hold: scenarioCargoOf(payload.ore, payload.coreFragments),
  }
}

function dropBaseOf(state: AuthorityState, kind: string, ownerId: string) {
  return {
    planetKey: sessionPlanetKeyOf(state),
    kind,
    ownerId,
    access: PLANET_KIT_ECONOMY.containerDefaultAccess,
    cap: PLANET_KIT_ECONOMY.containerCaps.get(kind) ?? 0,
  }
}

function pickupOf(state: AuthorityState, playerId: string, containerId: number): ContainerPickup {
  const vehicle = vehicleOf(state, playerId)
  return {
    planetKey: sessionPlanetKeyOf(state),
    playerId,
    containerId,
    hold: vehicle.cargo,
    capacity: statsOfVehicle(vehicle).cargoCapacity,
  }
}

function containerOnPlanet(state: AuthorityState, containerId: number): PlacedContainer | null {
  return containerAt(placedContainersIn(state), sessionPlanetKeyOf(state), containerId)
}

function withHold(state: AuthorityState, playerId: string, hold: Cargo): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), cargo: hold })
}

function unknownKindRejection(kind: string): Rejection | null {
  if (PLANET_KIT_ECONOMY.containerCaps.has(kind)) return null
  return rejectionOf('planet-kit.unknown_kind', `no container kind "${kind}"`)
}

function outOfPlayRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle) && vehicle.pose !== null) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode} or has no pose`)
}

function dropRejection(state: AuthorityState, drop: ContainerDrop): Rejection | null {
  const refusal = dropRefusalOf(placedContainersIn(state), drop)
  return refusal === null ? null : containerRejectionOf(refusal, drop.planetKey)
}

function pickupRefusalRejection(state: AuthorityState, pickup: ContainerPickup): Rejection | null {
  const refusal = pickupRefusalOf(placedContainersIn(state), pickup)
  return refusal === null ? null : containerRejectionOf(refusal, pickup.planetKey)
}

function reachRejection(
  vehicle: VehicleState,
  container: PlacedContainer | null,
): Rejection | null {
  if (container === null || vehicle.pose === null) return null
  if (isWithinDrillReach(vehicle.pose, container.cell)) return null
  return rejectionOf(
    'planet-kit.out_of_reach',
    `container ${container.containerId} is ${cellText(container.cell)}, out of reach`,
  )
}

function badCargoRejection(
  ore: Readonly<Record<string, string>>,
  ownerId: string,
): Rejection | null {
  const problems = [...scenarioCargoProblems(ore), ...(ownerId === '' ? ['ownerId is empty'] : [])]
  return problems.length === 0 ? null : { reason: 'planet-kit.bad_cargo', problems }
}

function containerRejectionOf(refusal: string, planetKey: string): Rejection {
  const reason = `planet-kit.${refusal}` as RejectionReason
  return rejectionOf(reason, `${refusal.replaceAll('_', ' ')} on planet ${planetKey}`)
}

function cellText(cell: TilePoint): string {
  return `at ${cell.tx},${cell.ty}`
}
