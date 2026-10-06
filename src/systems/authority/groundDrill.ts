/**
 * Drilling the ground for some ticks (decisions #7 drill rule, #36 Carving and Yield): the one path
 * both the scripted `drillTile` command and the reported `drillTicks` of `reportPose` go through,
 * so the two charge the same energy for the same work (#21 acceptance 7).
 *
 * `reportPose` carves the drill's disc stamp at the reported pose; `drillTile` carves one cell's
 * own samples. Either way a sample of a cell clears in that cell's #7 drill time (`ticksPerTile`
 * from the tip, the power (throttled when the heat gauge is over its line, #113) and the cell's
 * hardness), and only the ticks in which the stamp still
 * removed something are charged, no more than the tank pays for. A cell whose samples fall to half
 * yields once: 1 cargo unit of ore or core fragments (#7, #10); with a full hold the unit is lost,
 * never refused. The slices' gate checks may refuse an ore cell or destroy it without cargo, and
 * the drill reports each as a `DrillGated` (`drillGates.ts`); with none registered the drill is
 * unchanged.
 */
import { casingHardness } from '../economy/casingGrades'
import { coreHardness, blockHardness, oreSalePrice } from '../economy/oreEconomy'
import { toCanonical, type BigStat } from '../money'
import { drillDamage, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillStampOf } from '../vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { hasCargoRoom, withOreUnit, type VehicleState } from '../vehicle/vehicleState'
import {
  carveCell,
  carveDisc,
  type Carve,
  type CarveWindow,
  type CellDrillTicks,
} from '../world/groundEdit'
import type { YieldedCell } from '../world/cellYield'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import { harvestCoreTile } from './coreHarvest'
import type { DomainEventBody } from './domainEvent'
import { openDrillGates, type DrillGates } from './drillGates'
import { groundChangedEventsOf } from './groundChangedEvents'
import { heatThrottledDrill } from './heatRules'
import { minedOreOf, type MinedOre } from './minedOre'
import { wakeLavaBeside } from './lava/lavaRules'

type CarveIn = (world: WorldState, window: CarveWindow, drillTicksOf: CellDrillTicks) => Carve

/** Scripted mining: one cell's samples; call with a planet that has params. */
export function drillCell(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const carve: CarveIn = (world, window, drillTicksOf) =>
    carveCell(world, params, tile, window, drillTicksOf)
  return drillGround(state, params, playerId, { tile, carve }, requestedTicks)
}

/** The reported drill: the stamp at the pose, aimed by its facing (#40). */
export function drillAtPose(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  pose: VehiclePose,
  isLifting: boolean,
  target: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const stamp = drillStampOf(pose, isLifting)
  const carve: CarveIn = (world, window, drillTicksOf) =>
    carveDisc(world, params, stamp, window, drillTicksOf)
  return drillGround(state, params, playerId, { tile: target, carve }, requestedTicks)
}

/** Hardness is looked up from the planet and depth, never stored in the cell (#4, #6). */
export function hardnessOfTile(params: PlanetParams, tile: TilePoint, cell: number): BigStat {
  if (kindOfCell(cell) === CELL_KIND.core) return coreHardness(params.planetIndex)
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}

interface DrillTarget {
  /** The cell the drill is said to work on, for `drill_damage_dealt` and burrowers. */
  tile: TilePoint
  carve: CarveIn
}

function drillGround(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: DrillTarget,
  requestedTicks: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const drill = heatThrottledDrill(params.planetIndex, vehicle)
  const ticks = Math.min(requestedTicks, affordableTicksOf(vehicle))
  if (ticks === 0) return unchanged(state)
  const window = { firstTick: Math.max(0, state.tick - ticks), ticks }
  const gates = openDrillGates(state, playerId, params, drillTicksOfCells(params, drill))
  const carved = target.carve(state.world, window, gates.drillTicksOf)
  if (carved.ticksUsed === 0) return { state, events: gates.refusedEvents() }
  const charged = withVehicle({ ...state, world: carved.world }, playerId, {
    ...vehicle,
    energy: vehicle.energy - carved.ticksUsed * ENERGY_QUANTA_PER_TICK.drill,
  })
  const collected = collectYieldedCells(charged, playerId, params, carved.yielded, gates)
  return {
    state: wakeLavaBeside(collected.state, params, carved.yielded, state.tick),
    events: [
      damageEvent(params, state.world, target.tile, drill, carved.ticksUsed),
      ...groundChangedEventsOf(carved),
      ...casingDrilledEvents(carved),
      ...collected.events,
      ...gates.refusedEvents(),
    ],
  }
}

function affordableTicksOf(vehicle: VehicleState): number {
  return Math.floor(vehicle.energy / ENERGY_QUANTA_PER_TICK.drill)
}

/**
 * A sample's drill time from its own hardness: hard rock carves slower inside the same stamp, and
 * lining carves as band-G rock of its grade on this planet (#41 `casingHardness`).
 */
function drillTicksOfCells(params: PlanetParams, drill: DrillStats): CellDrillTicks {
  return (tile, material, casingGrade) =>
    ticksPerTile(drill, hardnessOfSample(params, tile, material, casingGrade))
}

function hardnessOfSample(
  params: PlanetParams,
  tile: TilePoint,
  material: number,
  casingGrade: number,
): BigStat {
  if (casingGrade === 0) return hardnessOfTile(params, tile, material)
  return casingHardness(params.planetIndex, casingGrade)
}

function collectYieldedCells(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  yielded: readonly YieldedCell[],
  gates: DrillGates,
): RuleEffect {
  return chainEffects(
    state,
    yielded.map(({ tile, cell }) => (current: AuthorityState) => {
      const collected = collectUngatedTile(current, playerId, params, { tile, cell }, gates)
      const destroyed: DomainEventBody = { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell) }
      return { state: collected.state, events: [destroyed, ...collected.events] }
    }),
  )
}

/** A cell a gate says is lost is destroyed, pays nothing and says why; every other is collected. */
function collectUngatedTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  yielded: YieldedCell,
  gates: DrillGates,
): RuleEffect {
  const lost = gates.lostEventOf(yielded)
  if (lost !== null) return { state, events: [lost] }
  return collectTile(state, playerId, params, yielded)
}

/** 1 unit per ore tile at any tier (#7), core fragments per core tile (#10); ground nothing. */
function collectTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, cell }: YieldedCell,
): RuleEffect {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.core) return harvestCoreTile(state, playerId, params)
  if (kind !== CELL_KIND.ore) return unchanged(state)
  return collectOreUnit(state, playerId, minedOreOf(params, tile, cell))
}

/**
 * One ore unit into the hold, named with its tier, ore id, depth and chunk (#122); with a full
 * hold it is lost, never refused (#7).
 */
export function collectOreUnit(state: AuthorityState, playerId: string, ore: MinedOre): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!hasCargoRoom(vehicle)) return { state, events: [{ type: 'StorageFull', lostUnits: 1 }] }
  return {
    state: withVehicle(state, playerId, {
      ...vehicle,
      cargo: withOreUnit(vehicle.cargo, ore.resourceTier),
    }),
    events: [
      {
        type: 'CargoAdded',
        ...ore,
        amount: 1,
        value: toCanonical(oreSalePrice(ore.resourceTier)),
      },
    ],
  }
}

/** What `TileDestroyed` calls a yielded cell's material. */
export function kindNameOf(cell: number): 'ground' | 'ore' | 'core' {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.ore) return 'ore'
  if (kind === CELL_KIND.core) return 'core'
  return 'ground'
}

/** The damage `ticks` of drilling deal in the target cell's hardness (#7 logging). */
function damageEvent(
  params: PlanetParams,
  world: WorldState,
  tile: TilePoint,
  drill: DrillStats,
  ticks: number,
): DomainEventBody {
  const hardness = hardnessOfTile(params, tile, materialCellAt(world, params, tile))
  const damage = toCanonical(drillDamage(drill, hardness, ticks))
  return { type: 'DrillDamageDealt', tx: tile.tx, ty: tile.ty, ticks, damage }
}

/** The lining the drill cleared (#41), logged once per drill command (#56 Q3); nothing when none. */
function casingDrilledEvents({ casingCleared }: Carve): DomainEventBody[] {
  if (casingCleared.samples === 0) return []
  return [{ type: 'CasingDrilled', ...casingCleared }]
}
