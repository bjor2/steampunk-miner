/**
 * The drill law's step a cut-follow reads (ticket 733, `vehicle/lineCellStep.ts`): through the
 * leading slab's slowest cell while a tick crosses at most a cell, as #570 reads it; past that,
 * walked along the front's line, each cell at its own gated drill time. Both the front's step
 * (`frontStepMmAt`) and the body's `vCut` read it, so the body keeps pace with the cut.
 *
 * The line starts where a riding cut's stamp sits at no step (`sweptStampAheadMmOf`) and runs to
 * the cutting bound. Its start cell is priced like any other for the mm the line still crosses in
 * it (ticket 921): left free, its rest was a gift every tick, up to a cell, so the rigs just past a
 * cell a tick read a quarter over the law. A cell the cut already cleared is open ground, and open
 * ground and a cell the drill may not cut cost nothing, as the slab's lead leaves them out: the
 * carry walk stops at such a cell, and the body drives up to its face.
 */
import { widthLevelOf } from '../registries/boreWidth'
import { aimOfPose, aimVectorOfPose } from '../vehicle/aim'
import { sweptStampAheadMmOf } from '../vehicle/drillStamp'
import { isWithinOneCell, stepPaidAlongMm, type FrontLine } from '../vehicle/lineCellStep'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { isTileYielded, materialCellAt } from '../world/worldState'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { vehicleOf, type AuthorityState } from './authorityState'
import { openDrillGates } from './drillGates'
import { subStepClockOf } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { drillQuantumAt, stepBoundsAt } from './stepBoundRead'

/** Where a step is read: the planet and the pose moved to the step. */
export interface StepAt {
  params: PlanetParams
  pose: VehiclePose
}

/** The law's step: the lead's while it crosses at most a cell a tick, else the front line's. */
export function lawStepMmOf(
  state: AuthorityState,
  playerId: string,
  at: StepAt,
  leadStepMm: number,
): number {
  if (isWithinOneCell(leadStepMm)) return leadStepMm
  return stepAlongFrontLineMm(state, playerId, at)
}

function stepAlongFrontLineMm(state: AuthorityState, playerId: string, at: StepAt): number {
  const line = frontLineOf(state, playerId, at.pose)
  const timeAt = lineCellTimeReader(state, playerId, at.params)
  return stepPaidAlongMm(line, timeAt, drillQuantumAt(state, playerId))
}

/** The front's line from a riding cut's stamp at no step, along the aim, to the cutting bound. */
function frontLineOf(state: AuthorityState, playerId: string, pose: VehiclePose): FrontLine {
  const aim = aimVectorOfPose(pose)
  const aheadMm = sweptStampAheadMmOf(0, aimOfPose(pose), widthLevelOf(state, playerId))
  const from = {
    xMm: pose.x + Math.floor((aim.x * aheadMm) / UP_VECTOR_SCALE),
    yMm: pose.y + Math.floor((aim.y * aheadMm) / UP_VECTOR_SCALE),
  }
  return { from, aim, limitMm: stepBoundsAt(state, playerId).cuttingMm }
}

/** Each cell's drill time along the line, read once: 0 in open ground or a stop. */
function lineCellTimeReader(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): (tile: TilePoint) => number {
  const timeOf = standingCellTimeReader(state, playerId, params)
  const times = new Map<string, number>()
  return (tile) => {
    const key = keyOf(tile)
    if (!times.has(key)) times.set(key, timeOf(tile))
    return times.get(key) ?? 0
  }
}

/** A cell's gated drill time in the rig's quantum while it stands and may be cut; else 0. */
function standingCellTimeReader(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): (tile: TilePoint) => number {
  const gatedTimeOf = gatedCellTimeReader(state, playerId, params)
  return (tile) => {
    const cell = materialCellAt(state.world, params, tile)
    if (!isRemovableCell(cell) || isTileYielded(state.world, tile)) return 0
    return gatedTimeOf(tile) ?? 0
  }
}

/**
 * A cell's sub-step drill time as the swept cut counts it, in the rig's quantum (heat, gates and
 * shocks included): null for one it cannot cut.
 */
export function gatedCellTimeReader(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): (tile: TilePoint) => number | null {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, playerId))
  const clock = subStepClockOf(drillQuantumAt(state, playerId))
  const cellTimes = clock.cellTimesOf(params, drill, shockTicksFor(state, playerId))
  const gates = openDrillGates(state, playerId, params, cellTimes)
  return (tile) => gates.drillTicksOf(tile, materialCellAt(state.world, params, tile), 0)
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
