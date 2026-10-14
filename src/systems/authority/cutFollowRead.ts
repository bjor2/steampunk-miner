/**
 * What the cut-follow reads (TD scope 0 on #316, ticket 333), from the world before a tick's cut:
 *
 * - the cut gate (`vehicle/cutGate.ts`) on the uncut share of the leading slab
 *   (`vehicle/leadingSlab.ts`) of the swept stamp at the step's position;
 * - while it is open, `vCut`: the drill law's speed through the slowest uncut cell of that slab
 *   (read on idle ticks too, so a rig that lets go of the drive brakes from it),
 *   `floor(1000 * Q / nLead)` mm a tick with `nLead` its sub-step drill time as the swept cut
 *   counts it (heat, gates and shocks included). A slab with nothing left to cut leaves travel to
 *   set the speed; one whose uncut cells the drill may not cut gives 0, so the body waits.
 *
 * The pose is the last reported one moved to the step's position, as `drillStep` cuts it. The
 * authority keeps `cutGateAt` on the cursor in each `drillStep`; the client reads `cutFollowAt`
 * from the same state, with the same position and drive, before it sends that step, so the
 * client's gate is the authority's on every tick. A tick with no step counts as one under the off
 * line on both sides.
 */
import { metresPerSecondOfStep, cutStepMmOf } from '../vehicle/cutSpeed'
import {
  CLOSED_CUT_GATE,
  idledCutGate,
  isCutGateOpen,
  nextCutGate,
  type CutGate,
} from '../vehicle/cutGate'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { leadingSlabOf, type LeadingSlab } from '../vehicle/leadingSlab'
import type { SweptCut } from '../vehicle/sweptCut'
import { travelSpeedOf } from '../vehicle/travelParity'
import { facingVectorOf, type VehiclePose } from '../vehicle/vehiclePose'
import { groundReaderOf } from '../world/groundReader'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { openDrillGates } from './drillGates'
import { SUB_STEP_CLOCK } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { planetParamsOf } from './planetOfState'

/** A tick's step as the client sends it: its position in mm, its lift, whether the drill bit. */
export interface CutFollowStep {
  x: number
  y: number
  isLifting: boolean
  /** The drill is engaged, so a `drillStep` goes out this tick; otherwise the tick idles. */
  isDrilling: boolean
}

export interface CutFollow {
  gate: CutGate
  /** m/s along the facing while the gate is open (0 while it is closed). */
  cutSpeed: number
}

/** The slab a step drives into, with what reading its cells needs. */
interface SlabRead {
  params: PlanetParams
  slab: LeadingSlab
}

export function cutFollowAt(
  state: AuthorityState,
  playerId: string,
  step: CutFollowStep,
): CutFollow {
  const read = slabReadOf(state, playerId, step)
  const gate = gateAfter(state, playerId, step.isDrilling ? read : null)
  if (!isCutGateOpen(gate) || read === null) return { gate, cutSpeed: 0 }
  return { gate, cutSpeed: cutSpeedOf(state, playerId, read) }
}

/** The gate a `drillStep` at `step` leaves on the cursor. */
export function cutGateAt(state: AuthorityState, playerId: string, step: CutFollowStep): CutGate {
  return gateAfter(state, playerId, step.isDrilling ? slabReadOf(state, playerId, step) : null)
}

function slabReadOf(state: AuthorityState, playerId: string, step: CutFollowStep): SlabRead | null {
  const params = planetParamsOf(state.planet)
  const reported = vehicleOf(state, playerId).pose
  if (params === null || reported === null) return null
  const pose: VehiclePose = { ...reported, x: step.x, y: step.y }
  const aim = {
    centreMm: pose,
    facing: facingVectorOf(pose.upx, pose.upy, pose.facing),
    stamp: sweptDrillStampOf(pose, step.isLifting),
  }
  return { params, slab: leadingSlabOf(groundReaderOf(state.world, params), aim) }
}

/** The cursor's gate idled to this tick, then this tick's slab, or one more idle tick. */
function gateAfter(state: AuthorityState, playerId: string, read: SlabRead | null): CutGate {
  const cursor = vehicleOf(state, playerId).sweptCut
  const idled = idledCutGate(cursor ?? CLOSED_CUT_GATE, idleTicksBefore(cursor, state.tick))
  return read === null ? idledCutGate(idled, 1) : nextCutGate(idled, read.slab.uncutBp)
}

/** The ticks since the cursor's step with no step of their own, before `tick`. */
function idleTicksBefore(cursor: SweptCut | undefined, tick: number): number {
  return cursor === undefined ? 0 : Math.max(0, tick - cursor.tick - 1)
}

/** `vCut` in m/s; travel's speed when the slab holds nothing to cut. */
function cutSpeedOf(state: AuthorityState, playerId: string, { params, slab }: SlabRead): number {
  if (slab.uncutTiles.length === 0) return travelSpeedOf(vehicleOf(state, playerId), params)
  const leadSubSteps = slowestSubStepsOf(state, playerId, params, slab.uncutTiles)
  return leadSubSteps === null ? 0 : metresPerSecondOfStep(cutStepMmOf(leadSubSteps))
}

/** `nLead`: the largest sub-step drill time of the cells, or null when one cannot be cut. */
function slowestSubStepsOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): number | null {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, playerId))
  const cellTimes = SUB_STEP_CLOCK.cellTimesOf(params, drill, shockTicksFor(state, playerId))
  const gates = openDrillGates(state, playerId, params, cellTimes)
  let slowest = 0
  for (const tile of tiles) {
    const subSteps = gates.drillTicksOf(tile, materialCellAt(state.world, params, tile), 0)
    if (subSteps === null) return null
    slowest = Math.max(slowest, subSteps)
  }
  return slowest
}
