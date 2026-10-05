/**
 * Drilling the ground for some ticks (decisions #7 drill rule, #36 Carving and Yield): the one path
 * both the scripted `drillTile` command and the reported `drillTicks` of `reportPose` go through,
 * so the two charge the same energy for the same work (#21 acceptance 7).
 *
 * `reportPose` carves the drill's disc stamp at the reported pose; `drillTile` carves one cell's
 * own samples. Either way a sample of a cell clears in that cell's #7 drill time (`ticksPerTile`
 * from the tip, the power and the cell's hardness), and only the ticks in which the stamp still
 * removed something are charged, no more than the tank pays for. A cell whose samples fall to half
 * yields once: 1 cargo unit of ore or core fragments (#7, #10); with a full hold the unit is lost,
 * never refused.
 */
import { coreHardness, blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import { toCanonical, type BigStat } from '../money'
import { drillDamage, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillStampOf } from '../vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { VehiclePose } from '../vehicle/vehiclePose'
import {
  hasCargoRoom,
  statsOfVehicle,
  withOreUnit,
  type VehicleState,
} from '../vehicle/vehicleState'
import {
  carveCell,
  carveDisc,
  type Carve,
  type CarveWindow,
  type CellDrillTicks,
  type GroundChange,
  type YieldedCell,
} from '../world/groundEdit'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell, tierOffsetOfCell } from '../world/worldCell'
import { deltaOfChunk, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import { harvestCoreTile } from './coreHarvest'
import type { DomainEventBody } from './domainEvent'

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
  const drill = statsOfVehicle(vehicle)
  const ticks = Math.min(requestedTicks, affordableTicksOf(vehicle))
  if (ticks === 0) return unchanged(state)
  const window = { firstTick: Math.max(0, state.tick - ticks), ticks }
  const carved = target.carve(state.world, window, drillTicksOfCells(params, drill))
  if (carved.ticksUsed === 0) return unchanged(state)
  const charged = withVehicle({ ...state, world: carved.world }, playerId, {
    ...vehicle,
    energy: vehicle.energy - carved.ticksUsed * ENERGY_QUANTA_PER_TICK.drill,
  })
  const collected = collectYieldedCells(charged, playerId, params, carved.yielded)
  return {
    state: collected.state,
    events: [
      damageEvent(params, state.world, target.tile, drill, carved.ticksUsed),
      ...carved.changes.map((change) => groundChangedEvent(carved.world, change)),
      ...collected.events,
    ],
  }
}

function affordableTicksOf(vehicle: VehicleState): number {
  return Math.floor(vehicle.energy / ENERGY_QUANTA_PER_TICK.drill)
}

/** A cell's drill time from its own hardness: hard rock carves slower inside the same stamp. */
function drillTicksOfCells(params: PlanetParams, drill: DrillStats): CellDrillTicks {
  return (tile, material) => ticksPerTile(drill, hardnessOfTile(params, tile, material))
}

function collectYieldedCells(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  yielded: readonly YieldedCell[],
): RuleEffect {
  return chainEffects(
    state,
    yielded.map(({ tile, cell }) => (current: AuthorityState) => {
      const collected = collectTile(current, playerId, params, cell)
      const destroyed: DomainEventBody = { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell) }
      return { state: collected.state, events: [destroyed, ...collected.events] }
    }),
  )
}

/** 1 unit per ore tile at any tier (#7), core fragments per core tile (#10); ground nothing. */
function collectTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  cell: number,
): RuleEffect {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.core) return harvestCoreTile(state, playerId, params)
  if (kind !== CELL_KIND.ore) return unchanged(state)
  const vehicle = vehicleOf(state, playerId)
  if (!hasCargoRoom(vehicle)) return { state, events: [{ type: 'StorageFull', lostUnits: 1 }] }
  const resourceTier = resourceTierOf(params, cell)
  return {
    state: withVehicle(state, playerId, {
      ...vehicle,
      cargo: withOreUnit(vehicle.cargo, resourceTier),
    }),
    events: [
      {
        type: 'CargoAdded',
        resourceTier,
        amount: 1,
        value: toCanonical(oreSalePrice(resourceTier)),
      },
    ],
  }
}

/** A cell stores its tier above the planet's band-1 ore (#4, #6). */
function resourceTierOf(params: PlanetParams, cell: number): number {
  return oreTier(params.planetIndex, 1 + tierOffsetOfCell(cell))
}

function kindNameOf(cell: number): 'ground' | 'ore' | 'core' {
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

function groundChangedEvent(world: WorldState, change: GroundChange): DomainEventBody {
  const { version } = deltaOfChunk(world, change.cx, change.cy)
  return { type: 'GroundChanged', ...change, version }
}
