/**
 * Automatic casing (decision #41 Placement rule, amended on #56): an effect of accepted movement,
 * never a command. Each accepted pose of an active vehicle moves its casing trail along the drill
 * stamp's centre (`followCasingTrail`, recording axis points only while the drill cut since the last
 * report) and lays one ring at each axis point now due, at the vehicle's casing grade, logging
 * `casing_placed` per ring. Never refused: a grade too low for the band still lines. A ring that
 * lines native rock for the first time is then charged (#76, `chargeFirstLining`); the debug
 * `lineCasing` lays the same ring free, as debug commands never count as play.
 */
import { followCasingTrail, type RingPoint, type TrailStep } from '../vehicle/casingTrail'
import { drillStampOf } from '../vehicle/drillStamp'
import { isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import { casingRingAround, lineRing, type Lining } from '../world/casingLining'
import type { PlanetParams } from '../world/planetParams'
import type { CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { chargeFirstLining } from './casingLiningCharge'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import { groundChangedEventsOf } from './groundChangedEvents'
import { planetParamsOf } from './planetOfState'

type PosePayload = CommandPayloads['reportPose']

export function layCasingAtPose(
  state: AuthorityState,
  playerId: string,
  payload: PosePayload,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  const vehicle = vehicleOf(state, playerId)
  const step = trailStepOf(vehicle, payload)
  if (params === null || step === null) return unchanged(state)
  const moved = withVehicle(state, playerId, { ...vehicle, casingTrail: step.trail })
  return layRings(moved, playerId, params, step.due, vehicle.casingGrade)
}

function trailStepOf(vehicle: VehicleState, payload: PosePayload): TrailStep | null {
  if (!isVehicleActive(vehicle) || vehicle.pose === null) return null
  const stamp = drillStampOf(vehicle.pose, payload.thrusting)
  const centre = { xMm: stamp.xMm, yMm: stamp.yMm }
  return followCasingTrail(vehicle.casingTrail, centre, payload.drillTicks > 0)
}

function layRings(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  points: readonly RingPoint[],
  grade: number,
): RuleEffect {
  return chainEffects(
    state,
    points.map(
      (point) => (current: AuthorityState) =>
        layPaidCasingRing(current, playerId, params, point, grade),
    ),
  )
}

/** A ring laid by drilling: lined as `debug.lineCasing` lines it, then its new lining charged. */
function layPaidCasingRing(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  point: RingPoint,
  grade: number,
): RuleEffect {
  const ring = lineCasingRing(state, params, point, grade)
  const charge = chargeFirstLining(ring.state, playerId, params, ring.linedSamples, grade)
  return { state: charge.state, events: [...ring.events, ...charge.events] }
}

/** One ring round an axis point, logged as `casing_placed`; `debug.lineCasing` lays the same. */
export function layCasingRing(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  grade: number,
): RuleEffect {
  const { state: lined, events } = lineCasingRing(state, params, point, grade)
  return { state: lined, events }
}

interface LinedRing extends RuleEffect {
  /** The native rock this ring lined for the first time. */
  linedSamples: Lining['linedSamples']
}

function lineCasingRing(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  grade: number,
): LinedRing {
  const lined = lineRing(state.world, params, casingRingAround(point.xMm, point.yMm), grade)
  return {
    state: { ...state, world: lined.world },
    events: [
      ...groundChangedEventsOf(lined),
      { type: 'CasingPlaced', samples: lined.placed, relined: lined.relined, grade },
    ],
    linedSamples: lined.linedSamples,
  }
}
