/**
 * The swept span's reference fixtures (ticket 374): sweeps a tick at a time through ground
 * softened to just over its yield, run through either carve from the same start. Only specs use
 * them. Since ticket 399 the cut reaches only as far as its work pays for, about half a softened
 * cell a tick at the tile dig floor, so a fixture's pose rests at its end while the cut catches up.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateVerdict } from '../registries/gateChecks'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { artefactCacheTile } from '../world/artefactCache'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { chunkKey, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { FLOOR, HEAT_PARAMS, onHeatPlanet } from './lava/lavaFixtures'
import {
  coreTiles,
  createScriptedSession,
  FREEZE_ENEMIES,
  mineTile,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'
import type { SweptStep } from './sweptDrill'

/** One tick of a swept cut, as `drillAlongSweep` and `drillAlongSpan` take it. */
export type SweepCut<T> = (
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
) => T

export interface Point {
  x: number
  y: number
}

/** A sweep's start, its planet, the slices it runs with and the positions it steps to. */
export interface SweepFixture {
  start: () => AuthorityState
  params: PlanetParams
  slices: readonly SliceDefinition[]
  positions: readonly Point[]
}

/** Each tick's cut of the fixture, the state carried from one tick to the next by `effectOf`. */
export function sweepWith<T>(
  fixture: SweepFixture,
  cut: SweepCut<T>,
  effectOf: (cutTick: T) => RuleEffect,
): T[] {
  let state = fixture.start()
  const firstTick = state.tick + 1
  return fixture.positions.map((at, index) => {
    const pose: VehiclePose = { ...(vehicleOf(state, 'p1').pose as VehiclePose), ...at }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const ticked = { ...state, tick: firstTick + index }
    const cutTick = cut(ticked, fixture.params, 'p1', noseTileOf(pose), step)
    state = effectOf(cutTick).state
    return cutTick
  })
}

/** Every tick's position from `from` toward `to` at `speed` m/s, then `restTicks` more at `to`. */
export function positionsAlong(from: Point, to: Point, speed: number, restTicks = 0): Point[] {
  const stepMm = Math.round((speed * MM_PER_METRE) / TICKS_PER_SECOND)
  const isDiagonal = to.x !== from.x && to.y !== from.y
  // A diagonal moves 707/1000 of a step along each axis, so the step's length stays the speed's.
  const axisStep = isDiagonal ? Math.round((stepMm * 707) / 1000) : stepMm
  const span = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
  const toward = (start: number, end: number, index: number) =>
    start + Math.sign(end - start) * Math.min(index * axisStep, span)
  const moving = Array.from({ length: Math.ceil(span / axisStep) + 1 }, (_, index) => ({
    x: toward(from.x, to.x, index),
    y: toward(from.y, to.y, index),
  }))
  return [...moving, ...Array.from({ length: restTicks }, () => to)]
}

const STRONG_DRILL = [
  { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 400 } },
  { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 1000 } },
  { type: 'debug.setEnergy', payload: { energy: '100000' } },
  { type: 'debug.setHull', payload: { hull: '1000000' } },
] as const

/** What a debug carve leaves each sample of the softened ground: just over half solid. */
const SOFTENED_BY = 125
const SOFTENED_RADIUS_MM = 16_000

/**
 * Player `p1` on `session` reported at `at`, its enemies frozen, with a drill that scratches any
 * rock here and the ground within about 11 m of `softAt` carved to just over its yield.
 */
function armed(session: ScriptedSession, at: Point, facing: Facing, softAt: Point): AuthorityState {
  const tick = session.state().tick + 1
  session.submit(tick, FREEZE_ENEMIES)
  STRONG_DRILL.forEach((intent) => session.submit(tick, intent))
  session.submit(tick, {
    type: 'debug.carveCircle',
    payload: { ...softAt, radius: SOFTENED_RADIUS_MM, amount: SOFTENED_BY },
  })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, facing)
  session.submit(tick, { type: 'reportPose', payload: { ...payload, ...at } })
  return session.state()
}

/** The middle of a tile, in mm. */
export const centreOf = (tile: TilePoint): Point => ({
  x: tile.tx * MM_PER_METRE + MM_PER_METRE / 2,
  y: tile.ty * MM_PER_METRE + MM_PER_METRE / 2,
})

const isListed = (tiles: readonly TilePoint[], { tx, ty }: TilePoint) =>
  tiles.some((tile) => tile.tx === tx && tile.ty === ty)

const REFUSED: GateVerdict = {
  outcome: 'refused',
  gateKind: 'probe',
  required: 'probe-rig',
  have: 'none',
}

/** A slice refusing the listed ore cells, as a rig gate does, and electrifying the listed cells. */
function probeSliceOf(
  gated: readonly TilePoint[],
  electrified: readonly TilePoint[] = [],
): SliceDefinition {
  return {
    id: 'span-probe',
    register: (r) => {
      r.gateCheck({
        id: 'span-probe.listed-ore',
        check: ({ tile }) => (isListed(gated, tile) ? REFUSED : null),
      })
      r.magneticGround({
        id: 'span-probe.electrified',
        fieldAt: () => null,
        isElectrified: (_params, tile) => isListed(electrified, tile),
      })
    },
  }
}

/** Planet 1's chunk corner at (32, 256) m, 40-odd tiles down, crossed diagonally facing down. */
export function chunkCornerSweep(speed: number): SweepFixture {
  const from = { x: 28_500, y: 260_500 }
  const to = { x: 35_500, y: 253_500 }
  return {
    start: () => armed(createScriptedSession(), from, FACING.down, { x: 32_000, y: 257_000 }),
    params: PARAMS,
    slices: [],
    positions: positionsAlong(from, to, speed),
  }
}

/** Ticks a fixture's pose rests at its end: time for the cut to cross about 30 softened cells. */
const CATCH_UP_TICKS = 90

/**
 * Planet 1 straight down column 30, 30 m through softened ground about 40 tiles under the surface
 * (ticket 335: the same path at any speed), then resting while the cut catches up.
 */
export function columnSweep(speed: number): SweepFixture {
  const from = { x: 30_500, y: 261_500 }
  const to = { x: 30_500, y: 231_500 }
  return {
    start: () => armed(createScriptedSession(), from, FACING.down, { x: 30_500, y: 246_000 }),
    params: PARAMS,
    slices: [],
    positions: positionsAlong(from, to, speed, CATCH_UP_TICKS),
  }
}

/** Drill gear cutting a cell past the bit and one each side of the bore (tickets 234, 279). */
const WIDE_GEAR: SliceDefinition = {
  id: 'gear-probe',
  register: (r) =>
    r.drillGear({ id: 'gear-probe.gear', gearOf: () => ({ aheadCells: 1, sideCells: 1 }) }),
}

/** The chunk-corner sweep with the drill gear's cells beside the bore. */
export function gearedCornerSweep(speed: number): SweepFixture {
  return { ...chunkCornerSweep(speed), slices: [WIDE_GEAR] }
}

/** A seed whose planet-1 artefact cache has an ore cell two tiles to its left. */
const CACHE_SEED = 4
export const CACHE_PARAMS = planetParamsFor(CACHE_SEED, 1)
export const CACHE = artefactCacheTile(CACHE_PARAMS)
/** Every ore cell near the cache refuses the drill. */
export const CACHE_GATES = oreTilesAround(CACHE_PARAMS, CACHE, 6)

/**
 * Left along the cache's row into the gated ore beyond it, starting 4.6 m right of it, then resting
 * while the cut catches up.
 */
export function cacheSweep(speed: number): SweepFixture {
  const from = { x: centreOf(CACHE).x + 4_600, y: centreOf(CACHE).y }
  const to = { x: centreOf(CACHE).x - 6_000, y: centreOf(CACHE).y }
  const start = () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'debug.setPlanetSeed', payload: { planetSeed: CACHE_SEED } })
    return armed(session, from, FACING.left, centreOf(CACHE))
  }
  return {
    start,
    params: CACHE_PARAMS,
    slices: [probeSliceOf(CACHE_GATES)],
    positions: positionsAlong(from, to, speed, CATCH_UP_TICKS),
  }
}

function oreTilesAround(params: PlanetParams, tile: TilePoint, reach: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = tile.ty - reach; ty <= tile.ty + reach; ty++) {
    for (let tx = tile.tx - reach; tx <= tile.tx + reach; tx++) {
      if (kindOfCell(cellAt(EMPTY_WORLD, params, { tx, ty })) === CELL_KIND.ore) {
        tiles.push({ tx, ty })
      }
    }
  }
  return tiles
}

/** Planet-1 surface ore the full-hold sweep mines first, away from its path: 5 of 10 units. */
const PREFILLED: readonly TilePoint[] = [
  { tx: 12, ty: 298 },
  { tx: 30, ty: 293 },
  { tx: 30, ty: 292 },
  { tx: 31, ty: 292 },
  { tx: 55, ty: 291 },
]

/** In planet 1's surface ore cluster round (57, 291): a rim cell gated, the bit's way stopped. */
export const RIM_GATE: TilePoint = { tx: 58, ty: 291 }
export const STOP_GATE: TilePoint = { tx: 57, ty: 289 }
export const ELECTRIFIED: TilePoint = { tx: 57, ty: 290 }

/**
 * Down column 57 through the cluster with the hold half full, so it fills mid-span; then it rests
 * against the stopping gate for 40 ticks.
 */
export function fullHoldSweep(speed: number): SweepFixture {
  const from = { x: 57_500, y: 297_500 }
  const to = { x: 57_500, y: 285_000 }
  const start = () => {
    const session = createScriptedSession()
    PREFILLED.forEach((tile, index) => mineTile(session, 100 * (index + 1), tile))
    return armed(session, from, FACING.down, { x: 57_500, y: 291_000 })
  }
  const slice = probeSliceOf([RIM_GATE, STOP_GATE], [ELECTRIFIED])
  return { start, params: PARAMS, slices: [slice], positions: positionsAlong(from, to, speed, 40) }
}

/** Up through planet 8's lava pocket floor and the cave beyond it, then resting there. */
export function lavaSweep(speed: number): SweepFixture {
  const from = { x: centreOf(FLOOR).x, y: 294_500 }
  const to = { x: centreOf(FLOOR).x, y: 306_000 }
  return {
    start: () => armed(onHeatPlanet(), from, FACING.up, centreOf(FLOOR)),
    params: HEAT_PARAMS,
    slices: [],
    positions: positionsAlong(from, to, speed, CATCH_UP_TICKS),
  }
}

/** Down onto the top of planet 1's core, then 10 ticks resting on it. */
export function coreSweep(speed: number): SweepFixture {
  const [, , top] = coreTiles(3)
  const from = { x: centreOf(top).x, y: 11_500 }
  const to = { x: centreOf(top).x, y: 7_000 }
  return {
    start: () => armed(createScriptedSession(), from, FACING.down, to),
    params: PARAMS,
    slices: [],
    positions: positionsAlong(from, to, speed, 10),
  }
}

/** The chunks one tick's `GroundChanged` events name. */
export function chunksChangedIn(events: readonly DomainEventBody[]): Set<string> {
  return new Set(
    events.flatMap((event) =>
      event.type === 'GroundChanged' ? [chunkKey(event.cx, event.cy)] : [],
    ),
  )
}
