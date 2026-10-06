/**
 * The heat gauge in play (spec #113 design and numbers, built by #96), on a heat planet only:
 *
 * - Each accepted `reportPose` and `drillTile` settles the gauge from the last settled tick (a
 *   docked vehicle's report at the platform rate, as undocking does): first
 *   the ticks the drill ran (band heat plus drill heat), then the rest (band heat), each less the
 *   strongest cooling that applies: at the surface (no rock above, or docked), inside a corridor of
 *   the archetype's lining type, or idle (no drive, thrust or drill ticks in the report). Undocking
 *   settles the docked time at the surface rate.
 * - Above `throttleAt` the drill is throttled (`heatThrottledDrill`), at the level the gauge held
 *   when the drilling began, so throttling always comes before any heat damage.
 * - At the gauge's max the hull loses `damageAtMaxPerSecond` of `hullMax` for each tick spent
 *   there: `VehicleDamaged {source: heat}`, and at 0 hull `vehicle_destroyed {cause: heat}`.
 * - Rising past `throttleAt` or the max logs `heat_threshold {level}`; crossing `throttleAt` up
 *   and down logs `overheat_started` and `overheat_ended`.
 *
 * Off the act the gauge reads 0 and nothing heats; a vehicle that arrives hot cools at once.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { HazardArchetype } from '../economy/economyDefinition'
import {
  bandHeatPerSecond,
  drillHeatPerSecond,
  hazardArchetypeOn,
  heatCoolingPerSecond,
  heatDamagePerSecond,
  throttleFactor,
  type HeatCooling,
} from '../economy/heatEconomy'
import {
  add,
  cmp,
  div,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
} from '../money'
import type { DrillStats } from '../vehicle/drillRule'
import { liningTypeIndexOf } from '../vehicle/liningType'
import { tileOfPose } from '../vehicle/vehiclePose'
import {
  heatPointsOf,
  heatUnitsOfPoints,
  heatUnitsPerTickOf,
  runHeatSegments,
  type HeatRun,
  type HeatSegment,
  type VehicleHeat,
} from '../vehicle/vehicleHeat'
import { isVehicleActive, statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { isGuardedByLining } from '../world/liningGuard'
import { bandOfTile, depthTilesAt } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { planetParamsOf } from './planetOfState'
import { destroyIfHullGone } from './vehicleTransitions'

export const HEAT_DEBUG_RULES: { readonly 'debug.setHeat': CommandRule<'debug.setHeat'> } = {
  'debug.setHeat': {
    fields: { heat: 'wholeNumber' },
    reject: (state, { payload }) => heatRangeRejection(state, payload.heat),
    apply: (state, { playerId, payload, tick }) => {
      const heat = vehicleOf(state, playerId).heat
      const level = heatUnitsOfPoints(payload.heat)
      return unchanged(withHeat(state, playerId, { ...heat, level, settledTick: tick }))
    },
  },
}

/** What the vehicle did over the ticks being settled. */
export interface HeatActivity {
  /** Ticks the drill ran, at most the ticks being settled. */
  drillTicks: number
  /** No drive, thrust or drill ticks at all: stopped to cool down (#113 "idle"). */
  isIdle: boolean
}

const TICKS = fromSafeInteger(TICKS_PER_SECOND)

/** Settles an active vehicle's gauge up to `tick`, with its damage and lines. */
export function followHeat(
  state: AuthorityState,
  playerId: string,
  tick: number,
  activity: HeatActivity,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode === 'docked') return settleDockedHeat(state, playerId, tick)
  const params = planetParamsOf(state.planet)
  const archetype = hazardArchetypeOn(state.planet.index)
  const pose = vehicle.pose
  if (params === null || archetype === null || !isVehicleActive(vehicle) || pose === null) {
    return unchanged(skipHeatTo(state, playerId, archetype, tick))
  }
  const segments = activeSegmentsOf(state, params, archetype, { ...vehicle, pose }, tick, activity)
  return settleHeat(state, playerId, archetype, segments, tick)
}

/** The time a vehicle spent docked, cooled at the platform rate, settled as it leaves (#113). */
export function settleDockedHeat(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const archetype = hazardArchetypeOn(state.planet.index)
  if (archetype === null) return unchanged(skipHeatTo(state, playerId, archetype, tick))
  const ticks = Math.max(0, tick - vehicle.heat.settledTick)
  const surface = coolingOf(state.planet.index, ['surface'])
  const segment = { ticks, unitsPerTick: netUnitsPerTick(ZERO_MONEY, surface) }
  return settleHeat(state, playerId, archetype, [segment], tick)
}

/** The drill as the gauge leaves it: its power throttled above `throttleAt` (#113). */
export function heatThrottledDrill(planetIndex: number, vehicle: VehicleState): DrillStats {
  const stats = statsOfVehicle(vehicle)
  const archetype = hazardArchetypeOn(planetIndex)
  if (archetype === null) return stats
  const factor = throttleFactor(archetype, heatPointsOf(vehicle.heat.level))
  return { drillPower: mul(stats.drillPower, factor), drillTip: stats.drillTip }
}

/** Whether the gauge is above the throttle line: the HUD and the vehicle's shimmer. */
export function isOverheated(planetIndex: number, heat: VehicleHeat): boolean {
  const archetype = hazardArchetypeOn(planetIndex)
  return archetype !== null && heat.level > heatUnitsOfPoints(archetype.throttleAt)
}

export function withHeat(
  state: AuthorityState,
  playerId: string,
  heat: VehicleHeat,
): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), heat })
}

/** Moves the gauge's clock on without heating: a vehicle not in play, or off the act (cold). */
function skipHeatTo(
  state: AuthorityState,
  playerId: string,
  archetype: HazardArchetype | null,
  tick: number,
): AuthorityState {
  const heat = vehicleOf(state, playerId).heat
  const level = archetype === null ? 0 : heat.level
  return withHeat(state, playerId, { ...heat, level, settledTick: tick })
}

function settleHeat(
  state: AuthorityState,
  playerId: string,
  archetype: HazardArchetype,
  segments: readonly HeatSegment[],
  tick: number,
): RuleEffect {
  const heat = vehicleOf(state, playerId).heat
  const run = runHeatSegments(
    heat.level,
    segments,
    gaugeMaxUnitsOf(archetype),
    heatLinesOf(archetype),
  )
  const settled = withHeat(state, playerId, { ...heat, level: run.level, settledTick: tick })
  return chainEffects(settled, [
    () => ({ state: settled, events: heatLineEvents(archetype, run) }),
    (current) => takeHeatDamage(current, playerId, archetype, run.ticksAtMax),
    (current) => destroyIfHullGone(current, playerId, tick, 'heat'),
  ])
}

/** The drilling ticks, then the rest, each at its own rate (#113: drilling first, as energy is). */
function activeSegmentsOf(
  state: AuthorityState,
  params: PlanetParams,
  archetype: HazardArchetype,
  vehicle: VehicleState & { pose: NonNullable<VehicleState['pose']> },
  tick: number,
  activity: HeatActivity,
): HeatSegment[] {
  const ticks = Math.max(0, tick - vehicle.heat.settledTick)
  const drillTicks = Math.min(activity.drillTicks, ticks)
  const place = placeCoolingsOf(state, params, archetype, vehicle)
  const tile = tileOfPose(vehicle.pose)
  const bandHeat = bandHeatPerSecond(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
  const restCoolings: HeatCooling[] = activity.isIdle ? [...place, 'idle'] : place
  return [
    {
      ticks: drillTicks,
      unitsPerTick: netUnitsPerTick(
        add(bandHeat, drillHeatPerSecond(params.planetIndex)),
        coolingOf(params.planetIndex, place),
      ),
    },
    {
      ticks: ticks - drillTicks,
      unitsPerTick: netUnitsPerTick(bandHeat, coolingOf(params.planetIndex, restCoolings)),
    },
  ]
}

/** The coolings of where the vehicle is: the open surface, and a corridor of the act's lining. */
function placeCoolingsOf(
  state: AuthorityState,
  params: PlanetParams,
  archetype: HazardArchetype,
  vehicle: VehicleState & { pose: NonNullable<VehicleState['pose']> },
): HeatCooling[] {
  const tile = tileOfPose(vehicle.pose)
  const coolings: HeatCooling[] = []
  if (depthTilesAt(params, tile.tx, tile.ty) === 0) coolings.push('surface')
  const typeIndex = liningTypeIndexOf(archetype.liningType)
  if (isGuardedByLining(state.world, tile, typeIndex)) coolings.push('liningCorridor')
  return coolings
}

/** The strongest of the coolings that apply, as gauge points a second. */
function coolingOf(planetIndex: number, coolings: readonly HeatCooling[]): BigStat {
  return coolings
    .map((cooling) => heatCoolingPerSecond(planetIndex, cooling))
    .reduce((strongest, rate) => (cmp(rate, strongest) > 0 ? rate : strongest), ZERO_MONEY)
}

function netUnitsPerTick(heating: BigStat, cooling: BigStat): number {
  return heatUnitsPerTickOf(sub(heating, cooling))
}

/** `heat_threshold` for each line risen past, and the throttle's start and end edges. */
export function heatLineEvents(archetype: HazardArchetype, run: HeatRun): DomainEventBody[] {
  const overheat = overheatLineOf(archetype)
  return [
    ...run.risenPast.flatMap((line): DomainEventBody[] =>
      line === overheat
        ? [{ type: 'HeatThreshold', level: archetype.throttleAt }, { type: 'OverheatStarted' }]
        : [{ type: 'HeatThreshold', level: archetype.gaugeMax }],
    ),
    ...run.fellBelow
      .filter((line) => line === overheat)
      .map((): DomainEventBody => ({ type: 'OverheatEnded' })),
  ]
}

/**
 * The gauge lines the log watches: just above the throttle line, where the throttle (and
 * `isOverheated`) begins, so the log and the drill agree at exactly `throttleAt`; and the max.
 */
export function heatLinesOf(archetype: HazardArchetype): number[] {
  return [overheatLineOf(archetype), heatUnitsOfPoints(archetype.gaugeMax)]
}

function overheatLineOf(archetype: HazardArchetype): number {
  return heatUnitsOfPoints(archetype.throttleAt) + 1
}

/** `damageAtMaxPerSecond * hullMax` for each second at the max, never below 0 hull. */
function takeHeatDamage(
  state: AuthorityState,
  playerId: string,
  archetype: HazardArchetype,
  ticksAtMax: number,
): RuleEffect {
  if (ticksAtMax === 0) return unchanged(state)
  const vehicle = vehicleOf(state, playerId)
  const perSecond = heatDamagePerSecond(archetype, statsOfVehicle(vehicle).hullMax)
  const amount = div(mul(perSecond, fromSafeInteger(ticksAtMax)), TICKS)
  const hullAfter = cmp(vehicle.hull, amount) <= 0 ? ZERO_MONEY : sub(vehicle.hull, amount)
  return {
    state: withVehicle(state, playerId, { ...vehicle, hull: hullAfter }),
    events: [
      {
        type: 'VehicleDamaged',
        amount: toCanonical(amount),
        source: 'heat',
        arc: null,
        enemyId: null,
        kind: null,
        tier: null,
        hullAfter: toCanonical(hullAfter),
      },
    ],
  }
}

/** A heat off the act must be 0; on it, 0 to the gauge's max. */
function heatRangeRejection(state: AuthorityState, heat: number): Rejection | null {
  const max = hazardArchetypeOn(state.planet.index)?.gaugeMax ?? 0
  if (heat <= max) return null
  return rejectionOf('out_of_range', `heat must be 0 to ${max} on this planet, got ${heat}`)
}

function gaugeMaxUnitsOf(archetype: HazardArchetype): number {
  return heatUnitsOfPoints(archetype.gaugeMax)
}
