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
 * drill's cut, and past and beside the scripted cell too, so the bot cuts with the player's gear
 * (`drillGearCut.ts`, ticket 392); with none registered the cut is the disc or the cell alone. On a magnetic
 * planet an electrified cell takes its shock's ticks longer, and shocks the vehicle as it breaks
 * (`magnetic/electrifiedShock.ts`, spec #258).
 *
 * The swept cut (`drillStep`, ticket 330, `sweptDrill.ts`) goes through the same path one tick at a
 * time, counting drill time in sub-steps (`SUB_STEP_CLOCK`) and charging each cell it breaks its own
 * dig energy (ticket 335, `cellDigEnergy.ts`); every other drill counts and charges whole ticks.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { casingHardness } from '../economy/casingGrades'
import { coreHardness, blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import { toCanonical, type BigStat } from '../money'
import { pickedUpUnitOf, type PickedUp, type PickupFind } from '../registries/orePickup'
import { drillDamage, subStepsPerTile, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillStampOf } from '../vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { AheadLatch } from '../vehicle/aheadBearingLatch'
import type { DriveSigns } from '../vehicle/driveSigns'
import type { SideLatch } from '../vehicle/facedSide'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { hasCargoRoom, withOreUnit, type VehicleState } from '../vehicle/vehicleState'
import type { Carve, CarveWindow, CellDrillTicks } from '../world/groundEdit'
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
  carveCellWithGear,
  carveStampWithGear,
  type DrillCarve,
  type DrillCarveRequest,
} from './drillGearCut'
import { openDrillGates, type DrillGates } from './drillGates'
import { sweptCutEnergyOf } from './cellDigEnergy'
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

type CarveIn<C extends DrillCarve = DrillCarve> = (request: DrillCarveRequest) => C

/**
 * How a drill command counts drill time: in whole ticks, or in the swept cut's sub-steps of a
 * tick (ticket 330), with the cell times read in the same unit; and what its carve costs: the ticks
 * the stamp still removed something in, or (the swept cut, ticket 335) each broken cell's own dig
 * energy (`cellDigEnergy.ts`).
 */
export interface DrillClock {
  subStepsPerTick: number
  cellTimesOf: (
    params: PlanetParams,
    drill: DrillStats,
    shockTicksAt: ShockTicksAt,
  ) => CellDrillTicks
  /** The quanta a carve costs from a tank of `tank`, its cells timed by `cellTimes`. */
  energyOf: (carved: DrillCarve, cellTimes: CellDrillTicks, tank: number) => number
}

export const WHOLE_TICK_CLOCK: DrillClock = {
  subStepsPerTick: 1,
  cellTimesOf: drillTicksOfCells,
  energyOf: tickEnergyOf,
}

export const SUB_STEP_CLOCK: DrillClock = {
  subStepsPerTick: DRILL_SUBSTEPS_PER_TICK,
  cellTimesOf: drillSubStepsOfCells,
  energyOf: sweptCutEnergyOf,
}

/** The ticks the stamp still removed something in, at the drill's rate, and its gear's cells. */
function tickEnergyOf(carved: DrillCarve): number {
  return carved.ticksUsed * ENERGY_QUANTA_PER_TICK.drill + carved.gearQuanta
}

/** Scripted mining: one cell's samples and its drill gear's cells; call with a planet that has params. */
export function drillCell(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const carve: CarveIn = (request) => carveCellWithGear(state, params, playerId, tile, request)
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

export interface DrillTarget<C extends DrillCarve = DrillCarve> {
  /** The cell the drill is said to work on, for `drill_damage_dealt` and burrowers. */
  tile: TilePoint
  carve: CarveIn<C>
}

/** A drill command's effect, and its carve, or null when the tank paid for no tick. */
export interface DrillOutcome<C extends DrillCarve> {
  effect: RuleEffect
  carved: C | null
}

function drillGround(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: DrillTarget,
  requestedTicks: number,
): RuleEffect {
  return drillGroundBy(state, params, playerId, target, requestedTicks, WHOLE_TICK_CLOCK).effect
}

/** The one drill path, counting drill time on `clock`. */
export function drillGroundBy<C extends DrillCarve>(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: DrillTarget<C>,
  requestedTicks: number,
  clock: DrillClock,
): DrillOutcome<C> {
  const vehicle = vehicleOf(state, playerId)
  const drill = heatThrottledDrill(params.planetIndex, vehicle)
  const ticks = Math.min(requestedTicks, affordableTicksOf(vehicle))
  if (ticks === 0) return { effect: unchanged(state), carved: null }
  const window = windowOf(state.tick, ticks, clock)
  const cellTicks = clock.cellTimesOf(params, drill, shockTicksFor(state, playerId))
  const gates = openDrillGates(state, playerId, params, cellTicks)
  const carved = target.carve({ world: state.world, window, gates, energy: vehicle.energy })
  const effect = chargeAndCollect(state, params, playerId, { target, drill, gates, carved, clock })
  return { effect, carved }
}

/** The last `ticks` fixed steps before `tick`, counted on the clock's sub-steps. */
function windowOf(tick: number, ticks: number, clock: DrillClock): CarveWindow {
  return { firstTick: Math.max(0, tick - ticks), ticks, subStepsPerTick: clock.subStepsPerTick }
}

/** What a carve did, ready to be charged and collected. */
interface CarvedDrill {
  target: DrillTarget<DrillCarve>
  drill: DrillStats
  gates: DrillGates
  clock: DrillClock
  carved: DrillCarve
}

function chargeAndCollect(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { target, drill, gates, carved, clock }: CarvedDrill,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (carved.ticksUsed === 0) return { state, events: gates.refusedEvents() }
  const charged = withVehicle({ ...state, world: carved.world }, playerId, {
    ...withLatches(vehicle, carved),
    energy: vehicle.energy - clock.energyOf(carved, gates.drillTicksOf, vehicle.energy),
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

/** The vehicle keeps the cut's latches; a cut with no gear aimed by the drive leaves them be. */
function withLatches(vehicle: VehicleState, carved: DrillCarve): VehicleState {
  return withSideLatch(withAheadLatch(vehicle, carved.aheadLatch), carved.sideLatch)
}

function withAheadLatch(vehicle: VehicleState, latch: AheadLatch | null): VehicleState {
  return latch === null ? vehicle : { ...vehicle, aheadLatch: latch }
}

function withSideLatch(vehicle: VehicleState, latch: SideLatch | null): VehicleState {
  return latch === null ? vehicle : { ...vehicle, sideLatch: latch }
}

function affordableTicksOf(vehicle: VehicleState): number {
  return Math.floor(vehicle.energy / ENERGY_QUANTA_PER_TICK.drill)
}

/** `drillTicksOfCells` in the swept cut's sub-steps (ticket 330): the same cells, never rounded to a tick. */
export function drillSubStepsOfCells(
  params: PlanetParams,
  drill: DrillStats,
  shockTicksAt: ShockTicksAt,
): CellDrillTicks {
  return (tile, material, casingGrade) =>
    casingGrade === 0
      ? shockedSubStepsPerCell(drill, params, tile, material, shockTicksAt)
      : subStepsPerTile(drill, casingHardness(params.planetIndex, casingGrade))
}

function shockedSubStepsPerCell(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
  shockTicksAt: ShockTicksAt,
): number | null {
  const floor = scratchFloorOfCell(params, tile, cell)
  const cut = subStepsPerTile(drill, hardnessOfTile(params, tile, cell), floor)
  return cut === null ? null : cut + shockTicksAt(params, tile, cell) * DRILL_SUBSTEPS_PER_TICK
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
 * One ore unit into the hold at the tier the ore pickup seam keeps it at (#232, ticket 509: its own
 * sale tier, or its band's when the rarity trip clamp holds it), named with its tier, ore id, depth
 * and chunk (#122); with a full hold it is lost, never refused (#7), and never asks the seam.
 */
export function collectOreUnit(state: AuthorityState, playerId: string, ore: MinedOre): RuleEffect {
  if (!hasCargoRoom(vehicleOf(state, playerId))) {
    return { state, events: [{ type: 'StorageFull', lostUnits: 1 }] }
  }
  const picked = pickedUpUnitOf(state, playerId, pickupFindOf(state, ore))
  return storeOreUnit(picked, playerId, ore)
}

function pickupFindOf(
  state: AuthorityState,
  { band, resourceTier, saleTier }: MinedOre,
): PickupFind {
  const planetIndex = state.planet.index
  return { planetIndex, band, tierAboveBand: resourceTier - oreTier(planetIndex, band), saleTier }
}

/** The unit into the hold at the picked tier; `band` and `saleTier` stay off `CargoAdded`. */
function storeOreUnit(picked: PickedUp, playerId: string, ore: MinedOre): RuleEffect {
  const vehicle = vehicleOf(picked.state, playerId)
  const { saleTier: _ownSaleTier, band: _band, ...named } = ore
  return {
    state: withVehicle(picked.state, playerId, {
      ...vehicle,
      cargo: withOreUnit(vehicle.cargo, picked.saleTier),
    }),
    events: [
      {
        type: 'CargoAdded',
        ...named,
        amount: 1,
        value: toCanonical(oreSalePrice(picked.saleTier)),
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
