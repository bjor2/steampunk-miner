import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { onCurveSteps, vehicleStatsAt, type EngineStats } from '../../economy/vehicleStats'
import { ceil, cmp, div, fromSafeInteger, mul, sub, type BigStat } from '../../money'
import type { GateCheck } from '../../registries/gateChecks'
import type { MagneticField } from '../../registries/magneticGround'
import { replayRun } from '../../replay/replayRun'
import type { Vector2 } from '../../vehicle/localFrame'
import { IDLE_INTENT, type VehicleIntent } from '../../vehicle/vehicleIntent'
import { stepVehicleMotion } from '../../vehicle/vehicleMotion'
import { FACING } from '../../vehicle/vehiclePose'
import { isLavaAt } from '../../world/lavaFlow'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import { CELL_KIND, isAirCell, isRemovableCell, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { createAuthorityState, type AuthorityState } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import { ticksPerCell } from '../groundDrill'
import { HEAT_PARAMS, HEAT_PLANET } from '../lava/lavaFixtures'
import { createScriptedSession, drill, PARAMS, poseAbove, WORLD_SEED } from '../scriptedSession'
import { onCurveSessionOn, type RecordedSession } from './magneticFixtures'
import { magneticTugAt, magneticTugOnCutAt } from './magneticTug'
import { sensingReachAt } from './sensingReach'

// hazard:magnetic (GD lock on spec #258 Q2, ticket 290): a field tugs the rig toward its vein at
// most 10% of the on-curve engine's speed and never into lava, a gated cell or an open drop,
// sensing inside it keeps at least half its reach, and electrified cells shock the drill for at
// most 2% of the on-curve hull a contact and 25% a dive. Each is checked at 30 and 144 steps/s.

const STEP_RATES = [30, 144]
const MAGNETIC_PLANET = 25
/** The Lodestone act and two endless magnetic planets (#258 Q1); the fake ground is planet-blind. */
const MAGNETIC_PLANETS = [25, 26, 27, 28, 29, 31, 32, 43, 48]
const SPEED_EPSILON = 1e-9
const UP: Vector2 = { x: 0, y: 1 }
const NO_PULL: Vector2 = { x: 0, y: 0 }

/** A stand-in for `planet-mix`: one field round `field.vein` on every planet. */
function groundSlice(
  field: MagneticField,
  isElectrified: (tile: TilePoint, cell: number) => boolean = () => false,
): SliceDefinition {
  return {
    id: 'planet-mix',
    register: (r) =>
      r.magneticGround({
        id: 'planet-mix.test-ground',
        fieldAt: (_params, tile) => (isWithinField(field, tile) ? field : null),
        isElectrified: (_params, tile, cell) => isElectrified(tile, cell),
      }),
  }
}

function isWithinField(field: MagneticField, tile: TilePoint): boolean {
  const dx = tile.tx - field.vein.tx
  const dy = tile.ty - field.vein.ty
  return dx * dx + dy * dy <= field.radiusTiles * field.radiusTiles
}

const refuseEveryOre: GateCheck = {
  id: 'mining-gates.test-refuse',
  check: () => ({ outcome: 'refused', gateKind: 'test', required: 'rig', have: 'none' }),
}
const LOCKED_ORE: SliceDefinition = {
  id: 'mining-gates',
  register: (r) => r.gateCheck(refuseEveryOre),
}

function stateOn(planetIndex: number): AuthorityState {
  return createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })
}

function onCurveEngineOf(planetIndex: number): EngineStats {
  return vehicleStatsAt(onCurveSteps(planetIndex)).engine
}

function onCurveHullOf(planetIndex: number): BigStat {
  return vehicleStatsAt(onCurveSteps(planetIndex)).hullMax
}

function lengthOf(vector: Vector2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y)
}

/** A field 30 tiles under the dock column, in the planet's rock. */
function deepFieldOn(planetIndex: number): MagneticField {
  const params = planetParamsFor(WORLD_SEED, planetIndex)
  return { vein: { tx: 0, ty: params.radiusTiles - 30 }, radiusTiles: 5 }
}

/** The tug on every tile within the field round its vein that pulls at all. */
function tugsRound(state: AuthorityState, field: MagneticField): Vector2[] {
  const tugs: Vector2[] = []
  for (let dy = -field.radiusTiles; dy <= field.radiusTiles; dy++) {
    for (let dx = -field.radiusTiles; dx <= field.radiusTiles; dx++) {
      const tile = { tx: field.vein.tx + dx, ty: field.vein.ty + dy }
      const tug = magneticTugAt(state, 'p1', tile)
      if (tug !== null) tugs.push(tug)
    }
  }
  return tugs
}

interface Drift {
  topSpeed: number
  distance: number
}

/** The wheels' run along the ground for `seconds` from rest under a constant tug. */
function driftUnder(
  tug: Vector2,
  engine: EngineStats,
  intent: VehicleIntent,
  stepsPerSecond: number,
): Drift {
  const dt = 1 / stepsPerSecond
  let velocity = NO_PULL
  const drift = { topSpeed: 0, distance: 0 }
  for (let step = 0; step < 3 * stepsPerSecond; step++) {
    velocity = stepVehicleMotion(motionInput(velocity, engine, intent, dt, tug)).velocity
    drift.topSpeed = Math.max(drift.topSpeed, lengthOf(velocity))
    drift.distance += velocity.x * dt
  }
  return drift
}

function motionInput(
  velocity: Vector2,
  engine: EngineStats,
  intent: VehicleIntent,
  dt: number,
  tug: Vector2 | undefined,
) {
  return {
    velocity,
    up: UP,
    gravity: NO_PULL,
    intent,
    engine,
    canAct: true,
    isGrounded: true,
    boreOffset: null,
    isCuttingLevel: false,
    isWaitingForCut: false,
    dt,
    tug,
  }
}

/**
 * The tiles a rig starting on `start` stands on while the tug moves it for four seconds, read
 * again on every step (walls aside: only the tug's rule stops it).
 */
function tilesTuggedThrough(
  state: AuthorityState,
  start: TilePoint,
  stepsPerSecond: number,
): string[] {
  const dt = 1 / stepsPerSecond
  const engine = onCurveEngineOf(state.planet.index)
  const position = { x: start.tx + 0.5, y: start.ty + 0.5 }
  let velocity = NO_PULL
  const visited = new Set<string>()
  for (let step = 0; step < 4 * stepsPerSecond; step++) {
    const tile = { tx: Math.floor(position.x), ty: Math.floor(position.y) }
    visited.add(keyOf(tile))
    const tug = magneticTugAt(state, 'p1', tile) ?? undefined
    velocity = stepVehicleMotion(motionInput(velocity, engine, IDLE_INTENT, dt, tug)).velocity
    position.x += velocity.x * dt
  }
  return [...visited]
}

const keyOf = (tile: TilePoint) => `${tile.tx},${tile.ty}`
const besideOf = (tile: TilePoint, dx: number) => ({ tx: tile.tx + dx, ty: tile.ty })

function isPlainGround(params: PlanetParams, tile: TilePoint): boolean {
  return kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === CELL_KIND.ground
}

/** A cell of `isWanted` with plain ground on the two tiles to its left, scanned near the top. */
function wantedWithGroundLeft(
  params: PlanetParams,
  isWanted: (tile: TilePoint) => boolean,
  rows: { from: number; to: number },
): TilePoint {
  for (let ty = rows.from; ty > rows.to; ty--) {
    for (let tx = -60; tx <= 60; tx++) {
      const tile = { tx, ty }
      const hasGroundLeft = [1, 2].every((dx) => isPlainGround(params, besideOf(tile, -dx)))
      if (isWanted(tile) && hasGroundLeft) return tile
    }
  }
  throw new Error('no such tile')
}

/** Lava two tiles right of the start, the vein two past it. */
function lavaCourse() {
  const lava = wantedWithGroundLeft(
    HEAT_PARAMS,
    (tile) => isLavaAt(EMPTY_WORLD, HEAT_PARAMS, tile),
    { from: HEAT_PARAMS.radiusTiles, to: 100 },
  )
  return { state: stateOn(HEAT_PLANET), danger: lava }
}

/** An ore cell every gate refuses two tiles right of the start. */
function gatedCourse() {
  const isOre = (tile: TilePoint) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore
  const top = PARAMS.radiusTiles
  const ore = wantedWithGroundLeft(PARAMS, isOre, { from: top, to: top - 40 })
  return { state: stateOn(1), danger: ore }
}

/**
 * A shaft two tiles right of the start, along the air over the surface: the tile beside the start
 * stands on ground, the shaft's top has open ground beneath it.
 */
function dropCourse() {
  const shaftX = 24
  const surface = surfaceRowOfColumn(shaftX, PARAMS.radiusTiles)
  const session = createScriptedSession()
  for (const depth of [0, 1]) {
    const centre = { x: shaftX * 1000 + 500, y: (surface - depth) * 1000 + 500 }
    session.submit(0, {
      type: 'debug.carveCircle',
      payload: { ...centre, radius: 700, amount: 255 },
    })
  }
  return { state: session.state(), danger: { tx: shaftX, ty: surface + 1 } }
}

/** The rig starts two tiles left of the danger and the vein lies two tiles past it. */
function courseField(danger: TilePoint): MagneticField {
  return { vein: besideOf(danger, 2), radiusTiles: 6 }
}

/** The first `count` drillable cells down a column, from three below the surface. */
function columnCells(params: PlanetParams, tx: number, count: number): TilePoint[] {
  const top = surfaceRowOfColumn(tx, params.radiusTiles) - 3
  const cells = Array.from({ length: count }, (_, depth) => ({ tx, ty: top - depth }))
  const isSolid = (tile: TilePoint) => isRemovableCell(cellAt(EMPTY_WORLD, params, tile))
  if (!cells.every(isSolid)) throw new Error(`column ${tx} is not solid for ${count} cells`)
  return cells
}

const P25_PARAMS = planetParamsFor(WORLD_SEED, MAGNETIC_PLANET)
const DIVE = columnCells(P25_PARAMS, 6, 20)

/** Drills each cell from above until it breaks, with the ticks the drill needs for it. */
function drillDown(recorded: RecordedSession, cells: readonly TilePoint[], firstTick: number) {
  const stats = vehicleStatsAt(onCurveSteps(MAGNETIC_PLANET))
  let tick = firstTick
  for (const tile of cells) {
    const cell = cellAt(recorded.session.state().world, P25_PARAMS, tile)
    const ticks = ticksPerCell(stats, P25_PARAMS, tile, cell) as number
    recorded.submit(tick, poseAbove(tile, FACING.down))
    recorded.submit(tick + ticks, drill(tile, ticks))
    tick += ticks + 1
  }
  return tick
}

const shocksIn = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'ElectrifiedCellShocked')

/** `bp` basis points of `amount`, rounded up past the last digit money keeps. */
function shareOf(amount: BigStat, bp: number): BigStat {
  return ceil(div(mul(amount, fromSafeInteger(bp)), fromSafeInteger(10000)))
}

/** The run replayed in 30 and 144 fps frames answers what the live run answered. */
function expectSameAtBothRates(recorded: RecordedSession, endTick: number) {
  const straight = replayRun(WORLD_SEED, recorded.commands, { endTick })
  for (const framesPerSecond of STEP_RATES) {
    const framed = replayRun(WORLD_SEED, recorded.commands, { endTick, framesPerSecond })
    expect(shocksIn(framed.events)).toEqual(shocksIn(straight.events))
    expect(framed.digests).toEqual(straight.digests)
  }
}

describe('hazard:magnetic (spec #258, ticket 290)', () => {
  it('tug never exceeds 10% of on-curve engine speed or the #233 cap, at 30 and 144 steps/s', () => {
    for (const planetIndex of MAGNETIC_PLANETS) {
      const field = deepFieldOn(planetIndex)
      const engine = onCurveEngineOf(planetIndex)
      const tugs = withRegistrations([groundSlice(field)], () =>
        tugsRound(stateOn(planetIndex), field),
      )
      expect(tugs.length).toBeGreaterThan(0)
      for (const tug of tugs) {
        expect(lengthOf(tug)).toBeLessThanOrEqual(engine.speedMax / 10 + SPEED_EPSILON)
        expect(lengthOf(tug)).toBeLessThanOrEqual(engine.speedMax * 0.2 + SPEED_EPSILON)
      }
      const sideways = tugs.find((tug) => Math.abs(tug.x) > 0) as Vector2
      const drifts = STEP_RATES.map((rate) => driftUnder(sideways, engine, IDLE_INTENT, rate))
      const driven = { ...IDLE_INTENT, moveX: Math.sign(sideways.x) as 1 | -1 }
      const drives = STEP_RATES.map((rate) => driftUnder(sideways, engine, driven, rate))
      drifts.forEach((drift) =>
        expect(drift.topSpeed).toBeLessThanOrEqual(engine.speedMax / 10 + SPEED_EPSILON),
      )
      drives.forEach((drive) =>
        expect(drive.topSpeed).toBeLessThanOrEqual(engine.speedMax * 1.1 + SPEED_EPSILON),
      )
      expect(drifts[0].distance).toBeCloseTo(drifts[1].distance, 1)
    }
  })

  it('tug never ends in lava, a gated cell or an open drop, at 30 and 144 steps/s', () => {
    const courses = [
      { ...lavaCourse(), slices: [] as SliceDefinition[] },
      { ...gatedCourse(), slices: [LOCKED_ORE] },
      { ...dropCourse(), slices: [] as SliceDefinition[] },
    ]
    for (const course of courses) {
      const field = courseField(course.danger)
      const start = besideOf(course.danger, -2)
      for (const rate of STEP_RATES) {
        const visited = withRegistrations([groundSlice(field), ...course.slices], () =>
          tilesTuggedThrough(course.state, start, rate),
        )
        expect(visited).toContain(keyOf(besideOf(course.danger, -1)))
        expect(visited).not.toContain(keyOf(course.danger))
      }
    }
    const drop = dropCourse()
    expect(
      isAirCell(cellAt(drop.state.world, PARAMS, { ...drop.danger, ty: drop.danger.ty - 1 })),
    ).toBe(true)
  })

  it('sensing reach inside a field is at least 50% of base', () => {
    const field = deepFieldOn(MAGNETIC_PLANET)
    const state = stateOn(MAGNETIC_PLANET)
    const far = { tx: field.vein.tx + 40, ty: field.vein.ty }
    withRegistrations([groundSlice(field)], () => {
      for (let base = 1; base <= 40; base++) {
        const inside = sensingReachAt(state, field.vein, base)
        expect(inside * 2).toBeGreaterThanOrEqual(base)
        expect(inside).toBeLessThanOrEqual(base)
        expect(sensingReachAt(state, far, base)).toBe(base)
      }
    })
  })

  it('a contact costs at most 2% on-curve hull, at 30 and 144 steps/s', () => {
    const [cell] = DIVE
    const field = { vein: cell, radiusTiles: 1 }
    const isCell = (tile: TilePoint) => tile.tx === cell.tx && tile.ty === cell.ty
    withRegistrations([groundSlice(field, isCell)], () => {
      const recorded = onCurveSessionOn(MAGNETIC_PLANET)
      const hullBefore = recorded.session.vehicle().hull
      const endTick = drillDown(recorded, [cell], 1)
      const shocks = shocksIn(recorded.session.events())
      expect(shocks).toEqual([expect.objectContaining({ ...cell, hullBp: 200, withBit: false })])
      const lost = sub(hullBefore, recorded.session.vehicle().hull)
      expect(cmp(lost, shareOf(onCurveHullOf(MAGNETIC_PLANET), 200))).toBeLessThanOrEqual(0)
      expect(cmp(lost, fromSafeInteger(0))).toBe(1)
      expectSameAtBothRates(recorded, endTick)
    })
  })

  it('a full dive without the bit costs at most 25%, at 30 and 144 steps/s', () => {
    const field = { vein: DIVE[0], radiusTiles: 1 }
    const isOnDive = (tile: TilePoint) => DIVE.some((at) => at.tx === tile.tx && at.ty === tile.ty)
    withRegistrations([groundSlice(field, isOnDive)], () => {
      const recorded = onCurveSessionOn(MAGNETIC_PLANET)
      const hullBefore = recorded.session.vehicle().hull
      const endTick = drillDown(recorded, DIVE, 1)
      const shocks = shocksIn(recorded.session.events())
      const hullBps = shocks.map((shock) =>
        shock.type === 'ElectrifiedCellShocked' ? shock.hullBp : 0,
      )
      expect(shocks).toHaveLength(DIVE.length)
      expect(hullBps.reduce((sum, bp) => sum + bp, 0)).toBe(2500)
      const lost = sub(hullBefore, recorded.session.vehicle().hull)
      expect(cmp(lost, shareOf(onCurveHullOf(MAGNETIC_PLANET), 2500))).toBeLessThanOrEqual(0)
      expect(recorded.session.vehicle().mode).toBe('active')
      expectSameAtBothRates(recorded, endTick)
    })
  })

  it('lets a shielded cut break the cell in its own ticks, with no hull and withBit', () => {
    const [cell] = DIVE
    const field = { vein: cell, radiusTiles: 1 }
    const shield: SliceDefinition = {
      id: 'drill-gear',
      register: (r) => r.shockShield({ id: 'drill-gear.test-bit', isShielding: () => true }),
    }
    withRegistrations([groundSlice(field, () => true), shield], () => {
      const recorded = onCurveSessionOn(MAGNETIC_PLANET)
      const hullBefore = recorded.session.vehicle().hull
      const stats = vehicleStatsAt(onCurveSteps(MAGNETIC_PLANET))
      const unshielded = ticksPerCell(
        stats,
        P25_PARAMS,
        cell,
        cellAt(EMPTY_WORLD, P25_PARAMS, cell),
      )
      const cut = (unshielded as number) - 30
      recorded.submit(1, poseAbove(cell, FACING.down))
      recorded.submit(1 + cut, drill(cell, cut))
      expect(shocksIn(recorded.session.events())).toEqual([
        expect.objectContaining({ ticks: 0, hullBp: 0, withBit: true }),
      ])
      expect(recorded.session.vehicle().hull).toEqual(hullBefore)
      expect(recorded.session.vehicle().shockHullBp).toBeUndefined()
    })
  })

  it('holds a shielded drill still while it cuts, and tugs it as any rig outside a cut', () => {
    const field = deepFieldOn(MAGNETIC_PLANET)
    const tile = { tx: field.vein.tx + 2, ty: field.vein.ty }
    const state = stateOn(MAGNETIC_PLANET)
    const shield: SliceDefinition = {
      id: 'drill-gear',
      register: (r) => r.shockShield({ id: 'drill-gear.test-bit', isShielding: () => true }),
    }
    const bare = withRegistrations([groundSlice(field)], () => ({
      driving: magneticTugAt(state, 'p1', tile),
      cutting: magneticTugOnCutAt(state, 'p1', tile),
    }))
    const shielded = withRegistrations([groundSlice(field), shield], () => ({
      driving: magneticTugAt(state, 'p1', tile),
      cutting: magneticTugOnCutAt(state, 'p1', tile),
    }))
    expect(bare.driving).not.toBeNull()
    expect(bare.cutting).toEqual(bare.driving)
    expect(shielded).toEqual({ driving: bare.driving, cutting: null })
  })

  it('starts the next dive with a fresh count once the vehicle docks', () => {
    const field = { vein: DIVE[0], radiusTiles: 1 }
    withRegistrations([groundSlice(field, () => true)], () => {
      const recorded = onCurveSessionOn(MAGNETIC_PLANET)
      const tick = drillDown(recorded, DIVE.slice(0, 2), 1)
      expect(recorded.session.vehicle().shockHullBp).toBe(400)
      recorded.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
      expect(recorded.session.vehicle().shockHullBp).toBeUndefined()
    })
  })
})
