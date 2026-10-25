/**
 * Automatic casing (decision #41 Placement rule, amended on #56): an effect of accepted movement and
 * drilling, never a command. Each accepted pose of an active vehicle moves its casing trail along
 * the drill stamp's centre (`followCasingTrail`, recording axis points only while the drill cut
 * since the last report), and so does scripted mining (`drillTile`) from the last reported pose, so
 * every drill command lays casing the same way (#115); it lays one ring at each axis point now due,
 * at the vehicle's casing grade and in its active lining type (#113), logging `casing_placed` per
 * ring. Never refused: a grade too low for the band still lines. A ring that lines native rock for
 * the first time, or relays lining of another type, is then charged in its type (#76, #113,
 * `chargeFirstLining`); the debug `lineCasing` lays a standard ring free, as debug commands never
 * count as play. A wider rig's rings are laid round its own bore and fall due its own lag behind
 * the stamp (ticket 749), so the wall its wider stamp cut is the wall they line.
 */
import {
  followCasingTrail,
  followCasingTrailAlongCut,
  type AxisPoint,
  type CutAxis,
  type RingPoint,
  type TrailStep,
} from '../vehicle/casingTrail'
import { widthLevelOf } from '../registries/boreWidth'
import { boreRadiusMmAt, casingRingLagMmAt } from '../vehicle/drillBore'
import { drillStampOf } from '../vehicle/drillStamp'
import { liningTypeIndexOf } from '../vehicle/liningType'
import { isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import {
  casingRingAlong,
  casingRingAround,
  lineRingSamples,
  NO_RING_SWEEP,
  ringSamplesOf,
  type Lining,
} from '../world/casingLining'
import type { MmPoint } from '../world/casingRingBand'
import type { PlanetParams } from '../world/planetParams'
import type { WeightedSample } from '../world/stampShape'
import type { CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { casableRingSamplesOf } from './casingGates'
import { chargeFirstLining } from './casingLiningCharge'
import { rememberLinedRing } from './combat/wreckerRoute'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import { groundChangedEventsOf } from './groundChangedEvents'
import { planetParamsOf } from './planetOfState'

type PosePayload = CommandPayloads['reportPose']

/** How the drill moved since the trail last followed it. */
interface DrillMotion {
  isLifting: boolean
  isCutting: boolean
}

export function layCasingAtPose(
  state: AuthorityState,
  playerId: string,
  payload: PosePayload,
): RuleEffect {
  const motion = { isLifting: payload.thrusting, isCutting: payload.drillTicks > 0 }
  return layCasingAlongTrail(state, playerId, motion)
}

/**
 * A report whose drill ticks the swept cut's steps already cut (ticket 330): the steps recorded
 * the axis, so the report only lays the rings now due.
 */
export function layDueCasingAtPose(
  state: AuthorityState,
  playerId: string,
  payload: PosePayload,
): RuleEffect {
  return layCasingAlongTrail(state, playerId, { isLifting: payload.thrusting, isCutting: false })
}

/**
 * The swept cut's rings (tickets 330, 335): axis points at fixed spacing along the line to where
 * the step's stamp centre cut, so no step length leaves a gap; the rings due are laid in order,
 * each measured from the hole this step's cut swept (the GD's (e) ruling on #662).
 */
export function layCasingAlongCut(
  state: AuthorityState,
  playerId: string,
  axis: CutAxis,
  isCutting: boolean,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  const vehicle = vehicleOf(state, playerId)
  if (params === null || !isVehicleActive(vehicle)) return unchanged(state)
  const bore = boreOfPlayer(state, playerId)
  const step = followCasingTrailAlongCut(vehicle.casingTrail, axis, isCutting, bore.ringLagMm)
  return layTrailStep(state, playerId, params, step, sweepOfCut(axis))
}

/** How far the step's stamp stood from the body's line: the stamp's reach less its body point. */
function sweepOfCut({ to, stampReach }: CutAxis): MmPoint {
  return { xMm: stampReach.xMm - to.xMm, yMm: stampReach.yMm - to.yMm }
}

/** Scripted mining cuts from the last reported pose, which never lifts (`drillTile`, #115). */
export function layCasingAfterScriptedDrill(
  state: AuthorityState,
  playerId: string,
  ticks: number,
): RuleEffect {
  return layCasingAlongTrail(state, playerId, { isLifting: false, isCutting: ticks > 0 })
}

function layCasingAlongTrail(
  state: AuthorityState,
  playerId: string,
  motion: DrillMotion,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  const step = trailStepOf(vehicleOf(state, playerId), motion, boreOfPlayer(state, playerId))
  if (params === null || step === null) return unchanged(state)
  return layTrailStep(state, playerId, params, step, NO_RING_SWEEP)
}

/** The vehicle keeps the trail's rest and lays the rings now due, swept by the cut's `sweep`. */
function layTrailStep(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  step: TrailStep,
  sweep: MmPoint,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const moved = withVehicle(state, playerId, { ...vehicle, casingTrail: step.trail })
  const lining = { grade: vehicle.casingGrade, liningType: vehicle.lining.active }
  const rings = step.due.map((point, index) => ({
    point,
    stretchFrom: step.stretchStarts[index],
    sweep,
  }))
  return layRings(moved, playerId, params, rings, lining)
}

/**
 * A due axis point, where its stretch of axis starts and the sweep of the cut it fell due in,
 * which its ring is measured from.
 */
interface DueRing {
  point: AxisPoint
  stretchFrom: RingPoint
  sweep: MmPoint
}

/** What a vehicle's rings are laid as: its casing grade, in its active lining type. */
interface LaidLining {
  grade: number
  liningType: string
}

function trailStepOf(
  vehicle: VehicleState,
  motion: DrillMotion,
  bore: PlayerBore,
): TrailStep | null {
  if (!isVehicleActive(vehicle) || vehicle.pose === null) return null
  const stamp = drillStampOf(vehicle.pose, motion.isLifting)
  const centre = { xMm: stamp.xMm, yMm: stamp.yMm }
  return followCasingTrail(vehicle.casingTrail, centre, motion.isCutting, bore.ringLagMm)
}

/** The player's bore as the casing reads it (ticket 749): its radius and the ring lag round it. */
interface PlayerBore {
  radiusMm: number
  ringLagMm: number
}

function boreOfPlayer(state: AuthorityState, playerId: string): PlayerBore {
  const level = widthLevelOf(state, playerId)
  return { radiusMm: boreRadiusMmAt(level), ringLagMm: casingRingLagMmAt(level) }
}

function layRings(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  rings: readonly DueRing[],
  lining: LaidLining,
): RuleEffect {
  return chainEffects(
    state,
    rings.map(
      (ring) => (current: AuthorityState) =>
        layPaidCasingRing(current, playerId, params, ring, lining),
    ),
  )
}

/**
 * A ring laid by drilling: lined as `debug.lineCasing` lines it but along its stretch of axis, then its new lining charged for
 * the stretch of axis the ring stands for (per metre, not per ring: #76, #115), and it joins the
 * vehicle's route where tunnel wreckers live (#111).
 */
function layPaidCasingRing(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { point, stretchFrom, sweep }: DueRing,
  lining: LaidLining,
): RuleEffect {
  const { radiusMm } = boreOfPlayer(state, playerId)
  const samples = casableRingSamplesOf(
    state,
    playerId,
    params,
    casingRingAlong(point.xMm, point.yMm, stretchFrom, sweep, radiusMm),
  )
  const ring = lineCasingRing(
    state,
    params,
    samples,
    lining.grade,
    liningTypeIndexOf(lining.liningType),
  )
  const first = { ...lining, wall: ring.linedSamples, lengthMm: point.lengthMm }
  const charge = chargeFirstLining(ring.state, playerId, params, first)
  return {
    state: rememberLinedRing(charge.state, playerId, point),
    events: [...ring.events, ...charge.events],
  }
}

/**
 * One ring round an axis point, logged as `casing_placed`: `debug.lineCasing`'s ring, the drill's
 * without its gates, as no player asks.
 */
export function layCasingRing(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  grade: number,
  typeIndex: number,
): RuleEffect {
  const samples = ringSamplesOf(casingRingAround(point.xMm, point.yMm))
  const { state: lined, events } = lineCasingRing(state, params, samples, grade, typeIndex)
  return { state: lined, events }
}

interface LinedRing extends RuleEffect {
  /** The native rock this ring lined for the first time. */
  linedSamples: Lining['linedSamples']
}

function lineCasingRing(
  state: AuthorityState,
  params: PlanetParams,
  samples: readonly WeightedSample[],
  grade: number,
  typeIndex: number,
): LinedRing {
  const lined = lineRingSamples(state.world, params, samples, grade, typeIndex)
  return {
    state: { ...state, world: lined.world },
    events: [
      ...groundChangedEventsOf(lined),
      { type: 'CasingPlaced', samples: lined.placed, relined: lined.relined, grade },
    ],
    linedSamples: lined.linedSamples,
  }
}
