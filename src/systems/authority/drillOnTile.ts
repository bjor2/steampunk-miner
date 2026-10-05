/**
 * Drilling one tile for some ticks (decision #7 drill rule, #3 tile ownership): the one path both
 * the scripted `drillTile` command and the reported `drillTicks` of `reportPose` go through, so
 * the two give the same damage and the same energy for the same ticks (#21 acceptance 7).
 *
 * Only the ticks that do something are charged: none on a tile the tip cannot scratch (#7), and
 * no more than the tank pays for or the tile needs to break. A broken tile becomes air and pays
 * out 1 cargo unit of ore or core fragments (#7, #10); with a full hold the unit is lost, never refused.
 */
import { coreHardness, blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import {
  add,
  ceil,
  cmp,
  div,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  toSafeInteger,
  ZERO_MONEY,
  type BigStat,
} from '../money'
import {
  drillDamage,
  drillWorkPerTick,
  tileWorkToBreak,
  type DrillStats,
} from '../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  hasCargoRoom,
  statsOfVehicle,
  withOreUnit,
  type VehicleState,
} from '../vehicle/vehicleState'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, isRemovableCell, kindOfCell, tierOffsetOfCell } from '../world/worldCell'
import { cellAt, tileWorkAt, withTileRemoved, withTileWork } from '../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import { harvestCoreTile } from './coreHarvest'
import type { DomainEventBody } from './domainEvent'

/** Call with a planet that has params; `requestedTicks` is already validated against time. */
export function drillOnTile(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const cell = cellAt(state.world, params, tile)
  if (!isRemovableCell(cell)) return unchanged(state)
  const hardness = hardnessOfTile(params, tile, cell)
  const vehicle = vehicleOf(state, playerId)
  const drill = statsOfVehicle(vehicle)
  const ticks = ticksThatCount(state, vehicle, drill, tile, hardness, requestedTicks)
  if (ticks === 0) return unchanged(state)
  const charged = withVehicle(state, playerId, {
    ...vehicle,
    energy: vehicle.energy - ticks * ENERGY_QUANTA_PER_TICK.drill,
  })
  const worked = addDrillWork(charged, playerId, params, tile, cell, workOf(drill, hardness, ticks))
  return {
    state: worked.state,
    events: [damageEvent(tile, ticks, drillDamage(drill, hardness, ticks)), ...worked.events],
  }
}

/** Hardness is looked up from the planet and depth, never stored in the cell (#4, #6). */
function hardnessOfTile(params: PlanetParams, tile: TilePoint, cell: number): BigStat {
  if (kindOfCell(cell) === CELL_KIND.core) return coreHardness(params.planetIndex)
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}

function ticksThatCount(
  state: AuthorityState,
  vehicle: VehicleState,
  drill: DrillStats,
  tile: TilePoint,
  hardness: BigStat,
  requestedTicks: number,
): number {
  const perTick = drillWorkPerTick(drill, hardness)
  if (cmp(perTick, ZERO_MONEY) === 0) return 0
  const affordable = Math.floor(vehicle.energy / ENERGY_QUANTA_PER_TICK.drill)
  const remaining = sub(tileWorkToBreak(hardness), tileWorkAt(state.world, tile))
  const needed = toSafeInteger(ceil(div(remaining, perTick)))
  return Math.min(requestedTicks, affordable, needed)
}

function workOf(drill: DrillStats, hardness: BigStat, ticks: number): BigStat {
  return mul(drillWorkPerTick(drill, hardness), fromSafeInteger(ticks))
}

function addDrillWork(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
  work: BigStat,
): RuleEffect {
  const total = add(tileWorkAt(state.world, tile), work)
  const hardness = hardnessOfTile(params, tile, cell)
  if (cmp(total, tileWorkToBreak(hardness)) < 0) {
    return { state: { ...state, world: withTileWork(state.world, tile, total) }, events: [] }
  }
  return breakTile(state, playerId, params, tile, cell)
}

function breakTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): RuleEffect {
  const removed = { ...state, world: withTileRemoved(state.world, tile) }
  const destroyed: DomainEventBody = { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell) }
  const collected = collectTile(removed, playerId, params, cell)
  return { state: collected.state, events: [destroyed, ...collected.events] }
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

function damageEvent(tile: TilePoint, ticks: number, damage: BigStat): DomainEventBody {
  return { type: 'DrillDamageDealt', tx: tile.tx, ty: tile.ty, ticks, damage: toCanonical(damage) }
}
