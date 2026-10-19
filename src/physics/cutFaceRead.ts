/**
 * What `cutFaceRide.test.ts` reads of each tick of a live rig (ticket 570): the gap between the
 * body's face and the ground ahead along its facing, the density samples around the body that
 * dropped by half their range in the tick, and the cut's front before and after it, so a drop the
 * front did not cross (a pop) can be told from the face moving on. Test support only.
 */
import {
  MM_PER_METRE,
  PHYSICS_TIMESTEP,
  UP_VECTOR_SCALE,
  VEHICLE_COLLIDER_SIZE,
} from '../constants/physics'
import { readAuthorityState } from '../store/authorityLink'
import { readAuthorityTick, readLocalVehicle, readPlanetWorld } from '../store/gameStore'
import { planetParamsOf } from '../systems/authority/planetOfState'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { frontOfCursor } from '../systems/vehicle/sweptCut'
import { facingVectorOf, tileOfMillimetres } from '../systems/vehicle/vehiclePose'
import { groundReaderOf, type GroundReader } from '../systems/world/groundReader'
import { ISO_DENSITY, MM_PER_SAMPLE } from '../systems/world/sampleGrid'
import type { StampPoint } from '../systems/world/stampShape'
import { isSolidCell } from '../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../systems/world/worldState'
import type { TickRead } from './cutFollowFixtures'

/** A sample whose density fell by at least `POP_DROP` in a tick. */
export interface SampleDrop {
  sx: number
  sy: number
}

export interface FaceRead {
  tick: TickRead
  /** Metres from the body's face to the first solid ground ahead along its facing. */
  gapM: number
  drops: SampleDrop[]
  /** The cut's front after the tick, and the one before it; null where no open-gate cut left one. */
  front: StampPoint | null
  lastFront: StampPoint | null
  /** The facing as a unit vector. */
  ahead: Vector2
  /** Metres the body's centre moved in the tick. */
  movedM: number
  /** A cave the planet was generated with lies on the line ahead of the face, within the step. */
  isFacingCave: boolean
  samples: Map<string, number>
}

/** A drop of half the density range in one tick: a cell's worth of ground gone at once. */
const POP_DROP = 128
/** The samples read around the body, metres either way: the stamp and a step past it. */
const WINDOW_M = 3
const HALF_BODY_M = VEHICLE_COLLIDER_SIZE / 2
/** Across the face, metres from the centre line: the centre and a little inside each corner. */
const ACROSS_M = [-(HALF_BODY_M - 0.05), 0, HALF_BODY_M - 0.05]
const SCAN_STEP_M = 0.005
const SCAN_REACH_M = 3
/**
 * How far behind the last front a crossing tick may still lower a sample, the face's ramp and the
 * floor's undercut a sample further on (`cutFront.ts`), and how far ahead of the front: the
 * undercut, the front of a level cut's floor.
 */
const CROSSING_BEHIND_MM = 2 * MM_PER_SAMPLE
const CROSSING_PAST_FRONT_MM = MM_PER_SAMPLE

export function faceReadOf(tick: TickRead, last: FaceRead | null): FaceRead {
  const reader = readerNow()
  const { pose } = tick.result
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const ahead = { x: facing.x / UP_VECTOR_SCALE, y: facing.y / UP_VECTOR_SCALE }
  const samples = samplesAround(reader, tick.position)
  return {
    tick,
    gapM: faceGapOf(reader, tick.position, ahead),
    drops: last === null ? [] : dropsSince(last.samples, samples),
    front: frontNow(),
    lastFront: last?.front ?? null,
    ahead,
    movedM: last === null ? 0 : distanceOf(tick.position, last.tick.position),
    isFacingCave: isFacingNaturalCave(tick, ahead),
    samples,
  }
}

/** Whether a drop lies outside the stretch the front crossed in its tick. */
export function isPopIn({ sx, sy }: SampleDrop, read: FaceRead): boolean {
  if (read.front === null || read.lastFront === null) return false
  const alongOf = (point: StampPoint) =>
    (sx * MM_PER_SAMPLE - point.xMm) * read.ahead.x +
    (sy * MM_PER_SAMPLE - point.yMm) * read.ahead.y
  return (
    alongOf(read.front) > CROSSING_PAST_FRONT_MM || alongOf(read.lastFront) < -CROSSING_BEHIND_MM
  )
}

/**
 * The line ahead of the face, as far as a step and a cell, crosses a cave the planet was generated
 * with: there the face is the cave's, not the cut's, and the cut lets the body go (#433).
 */
function isFacingNaturalCave(tick: TickRead, ahead: Vector2): boolean {
  const { params } = readPlanetWorld()
  if (params === null) return false
  const reachM = HALF_BODY_M + (tick.read?.cutSpeed ?? 0) * PHYSICS_TIMESTEP + 1
  for (let past = HALF_BODY_M; past <= reachM; past += CAVE_STRIDE_M) {
    const xMm = Math.round((tick.position.x + ahead.x * past) * MM_PER_METRE)
    const yMm = Math.round((tick.position.y + ahead.y * past) * MM_PER_METRE)
    if (!isSolidCell(cellAt(EMPTY_WORLD, params, tileOfMillimetres(xMm, yMm)))) return true
  }
  return false
}

/** The cave line's stride: a quarter cell, so no cell on it is stepped over. */
const CAVE_STRIDE_M = 0.25

function readerNow(): GroundReader {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the rig is on no planet')
  return groundReaderOf(state.world, params)
}

function frontNow(): StampPoint | null {
  const cursor = readLocalVehicle().sweptCut
  if (cursor === undefined || cursor.tick !== readAuthorityTick() || cursor.cutGate !== 1) {
    return null
  }
  return frontOfCursor(cursor)
}

/** The nearest solid ground ahead of the face, across its width. */
function faceGapOf(reader: GroundReader, position: Vector2, ahead: Vector2): number {
  return Math.min(...ACROSS_M.map((across) => gapAlongOf(reader, position, ahead, across)))
}

function gapAlongOf(reader: GroundReader, position: Vector2, ahead: Vector2, across: number) {
  for (let gap = 0; gap <= SCAN_REACH_M; gap += SCAN_STEP_M) {
    const reach = HALF_BODY_M + gap
    const x = position.x + ahead.x * reach - ahead.y * across
    const y = position.y + ahead.y * reach + ahead.x * across
    if (reader.densityAtPoint(x, y) >= ISO_DENSITY) return gap
  }
  return Number.POSITIVE_INFINITY
}

function samplesAround(reader: GroundReader, { x, y }: Vector2): Map<string, number> {
  const perMetre = 1000 / MM_PER_SAMPLE
  const samples = new Map<string, number>()
  const [sx0, sy0] = [Math.floor((x - WINDOW_M) * perMetre), Math.floor((y - WINDOW_M) * perMetre)]
  const side = 2 * WINDOW_M * perMetre
  for (let sx = sx0; sx <= sx0 + side; sx++) {
    for (let sy = sy0; sy <= sy0 + side; sy++) samples.set(`${sx},${sy}`, reader.densityAt(sx, sy))
  }
  return samples
}

function dropsSince(before: Map<string, number>, now: Map<string, number>): SampleDrop[] {
  const drops: SampleDrop[] = []
  for (const [key, density] of now) {
    const was = before.get(key)
    if (was === undefined || was - density < POP_DROP) continue
    const [sx, sy] = key.split(',').map(Number)
    drops.push({ sx, sy })
  }
  return drops
}

function distanceOf(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
