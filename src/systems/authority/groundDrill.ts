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
 * A pose report's own cut (ticket 535, A6 "Option L") counts whole ticks too, so it cuts exactly
 * as before, but is charged on the density it removed at each cell's law time, the swept price,
 * with the part under a quantum carried on the vehicle (`LAW_WORK_CLOCK`, `vehicle/cutCarry.ts`):
 * scripted and reported drills then cut the same for the same ticks but no longer charge the same.
 * Behind the authority dev flag `drill.sweptLawCharge` (ticket 540) the swept cut is charged that
 * way too, on the same sub-step carve (`LAW_SUB_STEP_CLOCK`), its energy alone.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { casingHardness } from '../economy/casingGrades'
import { coreHardness, blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import { toCanonical, type BigStat } from '../money'
import { pickedUpUnitOf, type PickedUp, type PickupFind } from '../registries/orePickup'
import { drillDamage, subStepsPerTileAt, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillStampOf, stampSweptFrom } from '../vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { payLawWork, payLawWorkEnergy, type LawWorkTally } from '../vehicle/cutCarry'
import type { AheadLatch } from '../vehicle/aheadBearingLatch'
import type { DriveSigns } from '../vehicle/driveSigns'
import type { SideLatch } from '../vehicle/facedSide'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { hasCargoRoom, withOreUnit, type VehicleState } from '../vehicle/vehicleState'
import type { Carve, CarveWindow, CellDrillTicks, CellsBesideCut } from '../world/groundEdit'
import type { StampPoint } from '../world/stampShape'
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
  hasCarveRemoved,
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

/** The cell times a clock reads for a drill: drill times, and law times for the tally. */
type CellTimesOf = (
  params: PlanetParams,
  drill: DrillStats,
  shockTicksAt: ShockTicksAt,
) => CellDrillTicks

/** What a carve cost, and the vehicle carrying what the cut left owed (ticket 535). */
export interface DrillCharge {
  quanta: number
  vehicle: VehicleState
}

/**
 * How a drill command counts drill time: in whole ticks, or in the swept cut's sub-steps of a
 * tick (ticket 330), with the cell times read in the same unit; whether its carve tallies law
 * work (ticket 535); and what its carve costs: the ticks the stamp still removed something in,
 * (the swept cut, ticket 335) each broken cell's own dig energy (`cellDigEnergy.ts`), or (the
 * report's cut, ticket 535) the law work it removed with the carry (`cutCarry.ts`).
 */
export interface DrillClock {
  subStepsPerTick: number
  cellTimesOf: CellTimesOf
  /** The law time of a cell for the carve's tally, or null when the clock tallies none. */
  lawTimesOf: CellTimesOf | null
  /** What a carve costs `vehicle`, its cells timed by `cellTimes`, never more than its tank. */
  chargeOf: (carved: DrillCarve, cellTimes: CellDrillTicks, vehicle: VehicleState) => DrillCharge
}

export const WHOLE_TICK_CLOCK: DrillClock = {
  subStepsPerTick: 1,
  cellTimesOf: drillTicksOfCells,
  lawTimesOf: null,
  chargeOf: (carved, _cellTimes, vehicle) => ({ quanta: tickEnergyOf(carved), vehicle }),
}

/**
 * The swept cut's clock in `quantum` sub-steps a tick (ticket 330; the rig's drill quantum, ticket
 * 558): cell times in that quantum, each broken cell charged its own dig energy in it.
 */
export function subStepClockOf(quantum: number): DrillClock {
  return {
    subStepsPerTick: quantum,
    cellTimesOf: (params, drill, shockTicksAt) =>
      drillSubStepsOfCells(params, drill, shockTicksAt, quantum),
    lawTimesOf: null,
    chargeOf: (carved, cellTimes, vehicle) => ({
      quanta: sweptCutEnergyOf(carved, cellTimes, vehicle.energy, quantum),
      vehicle,
    }),
  }
}

/** The swept cut's clock at the base quantum: every rig's before ticket 558, and the capsule's. */
export const SUB_STEP_CLOCK: DrillClock = subStepClockOf(DRILL_SUBSTEPS_PER_TICK)

/**
 * The report's cut (ticket 535, A6): whole ticks, the carve as `WHOLE_TICK_CLOCK` cuts it, charged
 * on the law work it removed at the swept price with the carry (`vehicle/cutCarry.ts`).
 */
export const LAW_WORK_CLOCK: DrillClock = {
  subStepsPerTick: 1,
  cellTimesOf: drillTicksOfCells,
  lawTimesOf: drillSubStepsOfCells,
  chargeOf: (carved, _cellTimes, vehicle) =>
    payLawWork(vehicle, lawWorkTallyOf(carved, DRILL_SUBSTEPS_PER_TICK), vehicle.energy),
}

/**
 * The swept cut charged on the law work it removed (ticket 540, the TD seam 6234992964 as VS
 * 6234998337 confirmed it, Systems' ruling 6231144515): the carve, its sub-steps and cell times
 * are `SUB_STEP_CLOCK`'s, so it cuts byte for byte as the shipped swept cut, but its window names
 * the law time and the tally is paid as A6 pays the report's (`LAW_WORK_CLOCK`), its energy alone:
 * the swept cut heats from its steps' summed dig time, so the heat carry is never written. In the
 * rig's quantum, its tally in the same one (ticket 558).
 */
export function lawSubStepClockOf(quantum: number): DrillClock {
  const clock = subStepClockOf(quantum)
  return {
    ...clock,
    lawTimesOf: clock.cellTimesOf,
    chargeOf: (carved, _cellTimes, vehicle) =>
      payLawWorkEnergy(vehicle, lawWorkTallyOf(carved, quantum), vehicle.energy),
  }
}

/** The law-charged swept clock at the base quantum. */
export const LAW_SUB_STEP_CLOCK: DrillClock = lawSubStepClockOf(DRILL_SUBSTEPS_PER_TICK)

/** The ticks the stamp still removed something in, at the drill's rate, and its gear's cells. */
function tickEnergyOf(carved: DrillCarve): number {
  return carved.ticksUsed * ENERGY_QUANTA_PER_TICK.drill + carved.gearQuanta
}

/** What the carve removed, in density sub-steps of `quantum`: as tallied, and at gear shares. */
function lawWorkTallyOf(carved: DrillCarve, quantum: number): LawWorkTally {
  return { law: carved.lawWork, lawBp: carved.lawWorkBp, quantum }
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

/**
 * What a pose report drills with: the pose, its reported drive, whether it lifts, where its
 * capsule starts (ticket 537, `reportedCapsule.ts`), or null for the bare disc at the pose, and
 * when its drill gear's cells are cut (with the bit, or on every tick of the capsule's bite).
 */
export interface ReportedDrill {
  pose: VehiclePose
  drive: DriveSigns
  isLifting: boolean
  tail: StampPoint | null
  cellsBeside: CellsBesideCut
}

/**
 * The reported drill: the stamp at the pose, aimed by its facing (#40), as the capsule from its
 * tail when the bite runs on (ticket 537), and any drill gear, which may read the reported drive
 * (ticket 279), counted and charged on `clock`: whole ticks as every drill was, or the law work it
 * removed (ticket 535), on sub-steps for the capsule.
 */
export function drillAtPose(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  reported: ReportedDrill,
  target: TilePoint,
  requestedTicks: number,
  clock: DrillClock = WHOLE_TICK_CLOCK,
): RuleEffect {
  const { pose, drive, isLifting, tail, cellsBeside } = reported
  const bit = { pose, disc: stampSweptFrom(drillStampOf(pose, isLifting), tail), drive }
  const carve: CarveIn = (request) =>
    carveStampWithGear(state, params, playerId, bit, request, cellsBeside)
  return drillGroundBy(state, params, playerId, { tile: target, carve }, requestedTicks, clock)
    .effect
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
  const shockTicksAt = shockTicksFor(state, playerId)
  const window = windowOf(state.tick, ticks, clock, lawTimesOn(clock, params, drill, shockTicksAt))
  const cellTicks = clock.cellTimesOf(params, drill, shockTicksAt)
  const gates = openDrillGates(state, playerId, params, cellTicks)
  const carved = target.carve({ world: state.world, window, gates, energy: vehicle.energy })
  const effect = chargeAndCollect(state, params, playerId, { target, drill, gates, carved, clock })
  return { effect, carved }
}

/**
 * The last `ticks` fixed steps before `tick`, counted on the clock's sub-steps, tallying law work
 * at `lawTimeOf` when the clock names one (ticket 535).
 */
function windowOf(
  tick: number,
  ticks: number,
  clock: DrillClock,
  lawTimeOf: CellDrillTicks | null,
): CarveWindow {
  const window = {
    firstTick: Math.max(0, tick - ticks),
    ticks,
    subStepsPerTick: clock.subStepsPerTick,
  }
  return lawTimeOf === null ? window : { ...window, lawTimeOf }
}

function lawTimesOn(
  clock: DrillClock,
  params: PlanetParams,
  drill: DrillStats,
  shockTicksAt: ShockTicksAt,
): CellDrillTicks | null {
  return clock.lawTimesOf === null ? null : clock.lawTimesOf(params, drill, shockTicksAt)
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
  if (!hasCarveRemoved(carved)) return { state, events: gates.refusedEvents() }
  const charge = clock.chargeOf(carved, gates.drillTicksOf, vehicle)
  const charged = withVehicle({ ...state, world: carved.world }, playerId, {
    ...withLatches(charge.vehicle, carved),
    energy: vehicle.energy - charge.quanta,
  })
  const collected = chainEffects(charged, [
    (current) => collectYieldedCells(current, playerId, params, carved.yielded, gates),
    (current) => shockElectrifiedCells(current, playerId, params, carved.yielded),
  ])
  return {
    state: wakeLavaBeside(collected.state, params, carved.yielded, state.tick),
    events: [
      ...damageEventsOf(params, state.world, target.tile, drill, carved.ticksUsed),
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

/**
 * `drillTicksOfCells` in the swept cut's sub-steps (ticket 330): the same cells, never rounded to a
 * tick, in `quantum` sub-steps a tick (the base, or the rig's drill quantum, ticket 558).
 */
export function drillSubStepsOfCells(
  params: PlanetParams,
  drill: DrillStats,
  shockTicksAt: ShockTicksAt,
  quantum: number = DRILL_SUBSTEPS_PER_TICK,
): CellDrillTicks {
  return (tile, material, casingGrade) =>
    casingGrade === 0
      ? shockedSubStepsPerCell({ drill, quantum }, params, tile, material, shockTicksAt)
      : subStepsPerTileAt(quantum, drill, casingHardness(params.planetIndex, casingGrade))
}

/** A drill timed in a quantum. */
interface QuantumDrill {
  drill: DrillStats
  quantum: number
}

function shockedSubStepsPerCell(
  { drill, quantum }: QuantumDrill,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
  shockTicksAt: ShockTicksAt,
): number | null {
  const floor = scratchFloorOfCell(params, tile, cell)
  const cut = subStepsPerTileAt(quantum, drill, hardnessOfTile(params, tile, cell), floor)
  return cut === null ? null : cut + shockTicksAt(params, tile, cell) * quantum
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

/**
 * The damage `ticks` of drilling deal in the target cell's hardness (#7 logging); none when the
 * bit removed nothing and only its gear's cells cut (the report capsule's running bite, ticket 537).
 */
function damageEventsOf(
  params: PlanetParams,
  world: WorldState,
  tile: TilePoint,
  drill: DrillStats,
  ticks: number,
): DomainEventBody[] {
  return ticks === 0 ? [] : [damageEvent(params, world, tile, drill, ticks)]
}

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
