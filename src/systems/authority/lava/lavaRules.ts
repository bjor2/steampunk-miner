/**
 * Lava in play (spec #113 design and numbers, built by #96):
 *
 * - When the ground opens beside a lava pocket (a cell the drill or a debug carve opened), or a
 *   wrecker breaches a ring near lava a refractory lining kept out (#133), the lava comes loose,
 *   and on the clock every `LAVA_FLOW_STEP_TICKS` the loose lava flows
 *   one cell down into open tunnel (`lavaFlow.ts`). A refractory-lined cell keeps it out
 *   (`lava_blocked`, once where it stops); standard lining does not. The ground changes as ordinary
 *   `GroundChanged`, so guests and the renderer follow it.
 * - A vehicle whose body touches lava (`LAVA_CONTACT_REACH_MM`) at a pose report, or whose drill
 *   bites into it, takes `hazardContact`: +25 on the heat gauge and 5% of hullMax, at most once per
 *   `hitGraceTicks`; `lava_contact`, `VehicleDamaged {source: lava}`, and at 0 hull
 *   `vehicle_destroyed {cause: lava}`.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { hazardArchetypeOn, hazardContactDamage } from '../../economy/heatEconomy'
import type { HazardArchetype } from '../../economy/economyDefinition'
import { cmp, sub, toCanonical, ZERO_MONEY } from '../../money'
import { drillStampOf } from '../../vehicle/drillStamp'
import { liningTypeIndexOf } from '../../vehicle/liningType'
import { heatUnitsOfPoints, runHeatSegments } from '../../vehicle/vehicleHeat'
import type { RingPoint } from '../../vehicle/casingTrail'
import { tileOfMillimetres, tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, statsOfVehicle } from '../../vehicle/vehicleState'
import type { YieldedCell } from '../../world/cellYield'
import {
  flowLava,
  isKeptOutByLining,
  isLavaAt,
  lavaBesideOpenings,
  squareDistanceSqMm,
} from '../../world/lavaFlow'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import type { WorldState } from '../../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import type { TickOutcome } from '../combat/combatTick'
import { vehicleBodiesOf } from '../collapse/collapseWatch'
import type { DomainEvent, DomainEventBody } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { heatLineEvents, heatLinesOf, withHeat } from '../heatRules'
import { planetParamsOf } from '../planetOfState'
import { destroyIfHullGone } from '../vehicleTransitions'
import { lavaAfterStep, withLooseLava } from './lavaState'
import { LAVA_CONTACT_REACH_MM } from '../../../constants/balance'

const { hitGraceTicks } = ECONOMY.enemies.combat
const REACH_SQ_MM = LAVA_CONTACT_REACH_MM * LAVA_CONTACT_REACH_MM
const TOUCH_TILES = [-1, 0, 1]
/** A ring's outer edge (1.2 m) plus the tile a guarded cell sits beside its lava, rounded up. */
const LAVA_WAKE_TILES = 3

/** The pockets beside cells that just opened come loose. */
export function wakeLavaBeside(
  state: AuthorityState,
  params: PlanetParams,
  opened: readonly YieldedCell[],
  tick: number,
): AuthorityState {
  const tiles = lavaBesideOpenings(
    state.world,
    params,
    opened.map(({ tile }) => tile),
  )
  return { ...state, lava: withLooseLava(state.lava, tiles, tick) }
}

/** The next tick the lava steps, or null. */
/** The next tick the lava steps, never one the clock has passed; or null. */
export function nextLavaTick(state: AuthorityState): number | null {
  const due = state.lava.nextStepTick
  return due === null ? null : Math.max(due, state.tick + 1)
}

/**
 * Lava within `LAVA_WAKE_TILES` of a ring a tunnel wrecker breached, which lining of the sealing
 * type kept out of an open cell before the breach (`unbreached`), comes loose again: that lining
 * may be gone (#113, #111). Lava resting for any other reason stays put (#133): a breach opens no
 * ground, so a pocket that has lain against a cave since the planet was made, or one behind a
 * standard ring, has nothing new to flow into.
 */
export function wakeLavaNear(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  unbreached: WorldState,
) {
  const tiles = lavaKeptOutNear(unbreached, params, tileOfMillimetres(point.xMm, point.yMm))
  return { ...state, lava: withLooseLava(state.lava, tiles, state.tick) }
}

function lavaKeptOutNear(world: WorldState, params: PlanetParams, centre: TilePoint) {
  const guardTypeIndex = guardTypeIndexOn(params.planetIndex)
  const tiles: TilePoint[] = []
  for (let dy = -LAVA_WAKE_TILES; dy <= LAVA_WAKE_TILES; dy++) {
    for (let dx = -LAVA_WAKE_TILES; dx <= LAVA_WAKE_TILES; dx++) {
      const tile = { tx: centre.tx + dx, ty: centre.ty + dy }
      if (isLavaKeptOut(world, params, tile, guardTypeIndex)) tiles.push(tile)
    }
  }
  return tiles
}

function isLavaKeptOut(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  guardTypeIndex: number,
): boolean {
  return isLavaAt(world, params, tile) && isKeptOutByLining(world, params, tile, guardTypeIndex)
}

/** The lining type that seals lava on this planet's archetype, or -1 where nothing does. */
function guardTypeIndexOn(planetIndex: number): number {
  const archetype = hazardArchetypeOn(planetIndex)
  return archetype === null ? -1 : liningTypeIndexOf(archetype.liningType)
}

/** One flow step, if one is due at `tick`. */
export function runLavaTick(state: AuthorityState, tick: number): TickOutcome {
  const params = planetParamsOf(state.planet)
  const due = state.lava.nextStepTick
  if (params === null || due === null || due > tick) return { state, events: [] }
  const guardTypeIndex = guardTypeIndexOn(params.planetIndex)
  const bodies = vehicleBodiesOf(state).map(({ centre }) => centre)
  const step = flowLava(state.world, params, state.lava.loose, { guardTypeIndex, bodies })
  const events: DomainEventBody[] = [
    ...groundChangedEventsOf({ world: step.world, changes: step.changes, yielded: [] }),
    ...step.blocked.map(lavaBlockedEvent),
  ]
  return {
    state: { ...state, world: step.world, lava: lavaAfterStep(step.loose, tick) },
    events: events.map((body): DomainEvent => ({ tick, ...body })),
  }
}

/** A touch of lava at the pose, or under the drill while it ran, burns the vehicle (#113). */
export function touchLavaAtPose(
  state: AuthorityState,
  playerId: string,
  tick: number,
  isDrilling: boolean,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const params = planetParamsOf(state.planet)
  const archetype = hazardArchetypeOn(state.planet.index)
  if (params === null || archetype === null || vehicle.pose === null) return unchanged(state)
  if (!isVehicleActive(vehicle) || isInLavaGrace(vehicle.heat.lavaTouchTick, tick)) {
    return unchanged(state)
  }
  const touched = touchedLavaOf(state, params, vehicle.pose, isDrilling)
  if (touched === null) return unchanged(state)
  return chainEffects(state, [
    (current) => burnWithLava(current, playerId, archetype, touched, tick),
    (current) => destroyIfHullGone(current, playerId, tick, 'lava'),
  ])
}

function isInLavaGrace(lastTouch: number | null, tick: number): boolean {
  return lastTouch !== null && tick - lastTouch < hitGraceTicks
}

/** The first lava cell the body or the running drill touches, or null. */
function touchedLavaOf(
  state: AuthorityState,
  params: PlanetParams,
  pose: VehiclePose,
  isDrilling: boolean,
): TilePoint | null {
  const centre = { xMm: pose.x, yMm: pose.y }
  const body = lavaNear(state, params, tileOfPose(pose), (tile) => isWithinReach(tile, centre))
  if (body !== null || !isDrilling) return body
  const stamp = drillStampOf(pose, false)
  const nose = {
    tx: Math.floor(stamp.xMm / MM_PER_METRE),
    ty: Math.floor(stamp.yMm / MM_PER_METRE),
  }
  const bite = { xMm: stamp.xMm, yMm: stamp.yMm }
  return lavaNear(state, params, nose, (tile) => isWithinRadius(tile, bite, stamp.radiusMm))
}

function lavaNear(
  state: AuthorityState,
  params: PlanetParams,
  centre: TilePoint,
  isTouching: (tile: TilePoint) => boolean,
): TilePoint | null {
  for (const dy of TOUCH_TILES) {
    for (const dx of TOUCH_TILES) {
      const tile = { tx: centre.tx + dx, ty: centre.ty + dy }
      if (isTouching(tile) && isLavaAt(state.world, params, tile)) return tile
    }
  }
  return null
}

function isWithinReach(tile: TilePoint, centre: { xMm: number; yMm: number }): boolean {
  return squareDistanceSqMm(tile, centre) <= REACH_SQ_MM
}

function isWithinRadius(tile: TilePoint, centre: { xMm: number; yMm: number }, radiusMm: number) {
  return squareDistanceSqMm(tile, centre) <= radiusMm * radiusMm
}

/** +`hazardContact.heat` on the gauge and `hullFraction` of hullMax off the hull. */
function burnWithLava(
  state: AuthorityState,
  playerId: string,
  archetype: HazardArchetype,
  tile: TilePoint,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const spike = heatUnitsOfPoints(archetype.hazardContact.heat)
  const gaugeMax = heatUnitsOfPoints(archetype.gaugeMax)
  const lines = heatLinesOf(archetype)
  const run = runHeatSegments(
    vehicle.heat.level,
    [{ ticks: 1, unitsPerTick: spike }],
    gaugeMax,
    lines,
  )
  const amount = hazardContactDamage(archetype, statsOfVehicle(vehicle).hullMax)
  const hullAfter = cmp(vehicle.hull, amount) <= 0 ? ZERO_MONEY : sub(vehicle.hull, amount)
  const heat = { ...vehicle.heat, level: run.level, lavaTouchTick: tick }
  const burnt = withHeat(
    withVehicle(state, playerId, { ...vehicle, hull: hullAfter }),
    playerId,
    heat,
  )
  return {
    state: burnt,
    events: [
      { type: 'LavaTouched', tx: tile.tx, ty: tile.ty },
      ...heatLineEvents(archetype, run),
      {
        type: 'VehicleDamaged',
        amount: toCanonical(amount),
        source: 'lava',
        arc: null,
        enemyId: null,
        kind: null,
        tier: null,
        hullAfter: toCanonical(hullAfter),
      },
    ],
  }
}

/** `lava_blocked {ring}`: the lined cell the lava stopped at, its centre in mm. */
function lavaBlockedEvent(tile: TilePoint): DomainEventBody {
  const ring = `${tile.tx * MM_PER_METRE + MM_PER_METRE / 2},${tile.ty * MM_PER_METRE + MM_PER_METRE / 2}`
  return { type: 'LavaBlocked', ring }
}
