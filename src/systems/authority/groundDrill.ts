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
 * unchanged. A slice's drill gear adds cells past the bit and beside the bore to the reported
 * drill's cut (`drillGearCut.ts`); with none registered the cut is the disc alone. On a magnetic
 * planet an electrified cell takes its shock's ticks longer, and shocks the vehicle as it breaks
 * (`magnetic/electrifiedShock.ts`, spec #258).
 */
import { casingHardness } from '../economy/casingGrades'
import { coreHardness, blockHardness, oreSalePrice } from '../economy/oreEconomy'
import { toCanonical, type BigStat } from '../money'
import { drillDamage, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillStampOf } from '../vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { AheadLatch } from '../vehicle/aheadBearingLatch'
import type { DriveSigns } from '../vehicle/driveSigns'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { hasCargoRoom, withOreUnit, type VehicleState } from '../vehicle/vehicleState'
import { carveCell, type Carve, type CellDrillTicks } from '../world/groundEdit'
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
import {
  carveStampWithGear,
  withoutGear,
  type DrillCarve,
  type DrillCarveRequest,
} from './drillGearCut'
import { openDrillGates, type DrillGates } from './drillGates'
import { groundChangedEventsOf } from './groundChangedEvents'
import { heatThrottledDrill } from './heatRules'
import { minedOreOf, type MinedOre } from './minedOre'
import { oreCellHardness, scratchFloorOfCell } from './signatureCells'
import { wakeLavaBeside } from './lava/lavaRules'
import {
  shockElectrifiedCells,
  shockTicksFor,
  unshieldedShockTicksAt,
  type ShockTicksAt,
} from './magnetic/electrifiedShock'

type CarveIn = (request: DrillCarveRequest) => DrillCarve

/** Scripted mining: one cell's samples; call with a planet that has params. */
export function drillCell(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const carve: CarveIn = ({ world, window, gates }) =>
    withoutGear(carveCell(world, params, tile, window, gates.drillTicksOf))
  return drillGround(state, params, playerId, { tile, carve }, requestedTicks)
}

/** What a pose report drills with: the pose, its reported drive, and whether it lifts. */
export interface ReportedDrill {
  pose: VehiclePose
  drive: DriveSigns
  isLifting: boolean
}

/**
 * The reported drill: the stamp at the pose, aimed by its facing (#40), and any drill gear, which
 * may read the reported drive (ticket 279).
 */
export function drillAtPose(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  reported: ReportedDrill,
  target: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const { pose, drive, isLifting } = reported
  const bit = { pose, disc: drillStampOf(pose, isLifting), drive }
  const carve: CarveIn = (request) => carveStampWithGear(state, params, playerId, bit, request)
  return drillGround(state, params, playerId, { tile: target, carve }, requestedTicks)
}

/**
 * Hardness is looked up, never stored in the cell (#4, #6): ore by its own tier, so a lead cell
 * (#140) is as hard as its tier (#223) and a signature as five tiers up (`signatureCells.ts`),
 * core by the planet, the rest by its band.
 */
export function hardnessOfTile(params: PlanetParams, tile: TilePoint, cell: number): BigStat {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.core) return coreHardness(params.planetIndex)
  if (kind === CELL_KIND.ore) return oreCellHardness(params, tile, cell)
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}

/**
 * The ticks the drill takes to break an intact cell, at its hardness and its scratch floor, with
 * an electrified cell's shock (unshielded), so the bot and the tile-time view read what it costs.
 */
export function ticksPerCell(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): number | null {
  return shockedTicksPerCell(drill, params, tile, cell, unshieldedShockTicksAt)
}

function shockedTicksPerCell(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
  shockTicksAt: ShockTicksAt,
): number | null {
  const floor = scratchFloorOfCell(params, tile, cell)
  const cut = ticksPerTile(drill, hardnessOfTile(params, tile, cell), floor)
  return cut === null ? null : cut + shockTicksAt(params, tile, cell)
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
  const cellTicks = drillTicksOfCells(params, drill, shockTicksFor(state, playerId))
  const gates = openDrillGates(state, playerId, params, cellTicks)
  const carved = target.carve({ world: state.world, window, gates, energy: vehicle.energy })
  if (carved.ticksUsed === 0) return { state, events: gates.refusedEvents() }
  const charged = withVehicle({ ...state, world: carved.world }, playerId, {
    ...withAheadLatch(vehicle, carved.aheadLatch),
    energy: vehicle.energy - carved.ticksUsed * ENERGY_QUANTA_PER_TICK.drill - carved.gearQuanta,
  })
  const collected = chainEffects(charged, [
    (current) => collectYieldedCells(current, playerId, params, carved.yielded, gates),
    (current) => shockElectrifiedCells(current, playerId, params, carved.yielded),
  ])
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

/** The vehicle keeps the cut's latch; a cut with no gear aimed by the drive leaves it as it was. */
function withAheadLatch(vehicle: VehicleState, latch: AheadLatch | null): VehicleState {
  return latch === null ? vehicle : { ...vehicle, aheadLatch: latch }
}

function affordableTicksOf(vehicle: VehicleState): number {
  return Math.floor(vehicle.energy / ENERGY_QUANTA_PER_TICK.drill)
}

/**
 * A sample's drill time from its own hardness: hard rock carves slower inside the same stamp, and
 * lining carves as band-G rock of its grade on this planet (#41 `casingHardness`). An electrified
 * cell adds the shock the player's drill pays. The shared dig function the bore gun spends its
 * budget through too (ticket 313).
 */
export function drillTicksOfCells(
  params: PlanetParams,
  drill: DrillStats,
  shockTicksAt: ShockTicksAt,
): CellDrillTicks {
  return (tile, material, casingGrade) =>
    casingGrade === 0
      ? shockedTicksPerCell(drill, params, tile, material, shockTicksAt)
      : ticksPerTile(drill, casingHardness(params.planetIndex, casingGrade))
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
 * One ore unit into the hold at its sale tier (#232), named with its tier, ore id, depth and chunk
 * (#122); with a full hold it is lost, never refused (#7).
 */
export function collectOreUnit(state: AuthorityState, playerId: string, ore: MinedOre): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!hasCargoRoom(vehicle)) return { state, events: [{ type: 'StorageFull', lostUnits: 1 }] }
  const { saleTier, ...named } = ore
  return {
    state: withVehicle(state, playerId, {
      ...vehicle,
      cargo: withOreUnit(vehicle.cargo, saleTier),
    }),
    events: [
      { type: 'CargoAdded', ...named, amount: 1, value: toCanonical(oreSalePrice(saleTier)) },
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
  const material = materialCellAt(world, params, tile)
  const hardness = hardnessOfTile(params, tile, material)
  const damage = toCanonical(
    drillDamage(drill, hardness, ticks, scratchFloorOfCell(params, tile, material)),
  )
  return { type: 'DrillDamageDealt', tx: tile.tx, ty: tile.ty, ticks, damage }
}

/** The lining the drill cleared (#41), logged once per drill command (#56 Q3); nothing when none. */
export function casingDrilledEvents({ casingCleared }: Carve): DomainEventBody[] {
  if (casingCleared.samples === 0) return []
  return [{ type: 'CasingDrilled', ...casingCleared }]
}
