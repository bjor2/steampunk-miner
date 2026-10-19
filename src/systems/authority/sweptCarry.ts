/**
 * The drill carry's reads of the world (ticket 399, the TD ruling on #399 Q1-Q5): what each cell
 * the swept cut's centre crosses costs the carry walk (`vehicle/carryWalk.ts`), what the tick may
 * spend, and how the carve leaves the walk's cells to it.
 *
 * - **Price**: a cell's gated drill time in sub-steps (`subStepsPerTile` at its hardness, scratch
 *   floor and shock, #335) times its uncut density share, rounded up once: a part-dug or softened
 *   cell pays only for what is left. Open ground and yielded cells cost nothing.
 * - **Hard stops** are the walk's only stops: a cell whose gated drill time is null, a gated or
 *   tip-locked one (TD lock on #374, item 1).
 * - **Carry ends**: a core cell, an electrified (hazard) cell or lava ends the tick's walk at it;
 *   the tank and the hold are counted per paid cell, at the dig energy the cut charges for it
 *   (`cellDigEnergy.ts`) and one place per ore cell.
 * - **The purse**: the rig's drill quantum of sub-steps a tick (`DRILL_SUBSTEPS_PER_TICK` doubled
 *   for a fast rig, ticket 558), plus the cursor's carry counted in it when the step continues it
 *   (a fresh step starts from 0), the tank and the free places in the hold. A tick
 *   that leaves the tank unable to pay another carries nothing, whichever cells emptied it.
 * - **The cell past the pose**, which a walk that reaches the pose banks toward, is priced from the
 *   drill's ungated time: asking its gates would report a cell the cut has not met, and a gated
 *   one discards the carry the tick the walk meets it. A tip-locked one takes nothing.
 * - **The carry's cell**: the cell the carry works toward is cut by the carry alone, so the stamp
 *   leaves it standing until the walk pays for it; the paid cells yield first, in walk order.
 */
import { BASIS_POINTS, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { isElectrifiedCellAt } from '../registries/magneticGround'
import type {
  BeyondCell,
  CarryCell,
  CarryGround,
  CarryPurse,
  CarrySweep,
} from '../vehicle/carryWalk'
import { carrySubStepsIn, SWEEP_STEP_MM, type SweepPath } from '../vehicle/sweptCut'
import { facingVectorOf, tileOfMillimetres, type VehiclePose } from '../vehicle/vehiclePose'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { cellDensitySum, type YieldedCell } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, isLavaCell, isRemovableCell, kindOfCell } from '../world/worldCell'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { cellDigEnergyOf } from './cellDigEnergy'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { drillQuantumAt } from './stepBoundRead'
import type { DrillCarveRequest } from './drillGearCut'
import type { DrillGates } from './drillGates'

const OPEN_CELL: CarryCell = { price: 0, energy: 0, isOre: false, isCarryEnd: false }
const LAVA_CELL: CarryCell = { ...OPEN_CELL, isCarryEnd: true }

/** A cell's diagonal, in whole mm: past it the walk along the facing has left the cell. */
const MM_PER_CELL_DIAGONAL = 1_415

/** The carve request's world and gates, read as the carry walk's ground. */
export function carryGroundOf(params: PlanetParams, request: DrillCarveRequest): CarryGround {
  const { world, gates } = request
  const timed = { gates, quantum: request.window.subStepsPerTick ?? DRILL_SUBSTEPS_PER_TICK }
  return {
    isStop: (tile) => isStopCell(world, params, gates, tile),
    cellAt: (tile) => carryCellAt(world, params, timed, tile),
  }
}

/** The carve's gates, timed in the sub-steps a tick its window counts (the drill quantum). */
interface TimedGates {
  gates: DrillGates
  quantum: number
}

/** A cell standing in the drill's way: solid, not yet opened, and one it cannot cut. */
function isStopCell(
  world: WorldState,
  params: PlanetParams,
  gates: DrillGates,
  tile: TilePoint,
): boolean {
  const cell = materialCellAt(world, params, tile)
  if (!isRemovableCell(cell) || isTileYielded(world, tile)) return false
  return gates.drillTicksOf(tile, cell, 0) === null
}

function carryCellAt(
  world: WorldState,
  params: PlanetParams,
  { gates, quantum }: TimedGates,
  tile: TilePoint,
): CarryCell {
  const cell = materialCellAt(world, params, tile)
  if (isLavaCell(cell)) return LAVA_CELL
  if (!isRemovableCell(cell) || isTileYielded(world, tile)) return OPEN_CELL
  const subSteps = gates.drillTicksOf(tile, cell, 0) ?? 0
  return {
    price: uncutPriceOf(subSteps, cellDensitySum(world, params, tile)),
    energy: cellDigEnergyOf(subSteps, BASIS_POINTS, quantum),
    isOre: kindOfCell(cell) === CELL_KIND.ore,
    isCarryEnd: kindOfCell(cell) === CELL_KIND.core || isElectrifiedCellAt(params, tile, cell),
  }
}

/** The drill time of what is left of a cell: its full time times its uncut share, rounded up. */
function uncutPriceOf(subSteps: number, densitySum: number): number {
  return Math.ceil((subSteps * densitySum) / (SAMPLES_PER_CELL * SOLID_DENSITY))
}

/**
 * What the player's tick may spend: a tick's work in its drill quantum and any carry it continues,
 * counted in that quantum (ticket 558), tank and hold.
 */
export function carryPurseOf(
  state: AuthorityState,
  playerId: string,
  { path, quantum }: QuantumPath,
): CarryPurse {
  const vehicle = vehicleOf(state, playerId)
  const carried = path.isFresh ? 0 : carrySubStepsIn(vehicle.sweptCut, quantum)
  const room = statsOfVehicle(vehicle).cargoCapacity - cargoUnitsOf(vehicle.cargo)
  return {
    subSteps: quantum + carried,
    tank: vehicle.energy,
    room: Math.max(0, room),
  }
}

/** A tick's path, and the drill quantum its work counts in. */
export interface QuantumPath {
  path: SweepPath
  quantum: number
}

/** A tick's path, its pose and the world it cuts. */
export interface CarryPath {
  path: SweepPath
  pose: VehiclePose
  world: WorldState
}

/** The path, and the first cell past its end along the pose's facing, priced ungated. */
export function carrySweepOf(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { path, pose, world }: CarryPath,
): CarrySweep {
  const tile = cellPastEndOf(path, pose)
  if (tile === null) return { path, beyond: null }
  return { path, beyond: beyondCellOf(state, params, playerId, { tile, world }) }
}

/** The tile the stamp's centre would enter next, walked on along the facing from the path's end. */
function cellPastEndOf(path: SweepPath, pose: VehiclePose): TilePoint | null {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const end = tileOfMillimetres(path.to.xMm, path.to.yMm)
  for (let walked = SWEEP_STEP_MM; walked <= MM_PER_CELL_DIAGONAL; walked += SWEEP_STEP_MM) {
    const tile = tileOfMillimetres(
      path.to.xMm + Math.floor((ahead.x * walked) / UP_VECTOR_SCALE),
      path.to.yMm + Math.floor((ahead.y * walked) / UP_VECTOR_SCALE),
    )
    if (tile.tx !== end.tx || tile.ty !== end.ty) return tile
  }
  return null
}

/** The cell past the pose at the drill's own time, no gate asked; nothing for open ground. */
function beyondCellOf(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  cut: CellInWorld,
): BeyondCell {
  return { tile: cut.tile, price: ungatedPriceOf(state, params, playerId, cut) }
}

/** A cell, and the world it stands in. */
export interface CellInWorld {
  tile: TilePoint
  world: WorldState
}

/**
 * What is left of a cell priced at the drill's own time, no gate asked (asking reports the cell);
 * nothing for open ground.
 */
export function ungatedPriceOf(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { tile, world }: CellInWorld,
): number {
  const cell = materialCellAt(world, params, tile)
  if (!isRemovableCell(cell) || isTileYielded(world, tile)) return 0
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, playerId))
  const shockTicksAt = shockTicksFor(state, playerId)
  const quantum = drillQuantumAt(state, playerId)
  const subSteps = drillSubStepsOfCells(params, drill, shockTicksAt, quantum)
  return uncutPriceOf(subSteps(tile, cell, 0) ?? 0, cellDensitySum(world, params, tile))
}

/**
 * The request with the carry's cell left to the carry: the stamp does not carve it, though it still
 * asks the cell's gates as it meets it, so a gate there is reported where the stamp reaches it.
 */
export function leavingCellToCarry(
  request: DrillCarveRequest,
  target: TilePoint | null,
): DrillCarveRequest {
  if (target === null) return request
  const { gates } = request
  const isTarget = (tile: TilePoint) => tile.tx === target.tx && tile.ty === target.ty
  const drillTicksOf: DrillGates['drillTicksOf'] = (tile, material, grade) => {
    const ticks = gates.drillTicksOf(tile, material, grade)
    return isTarget(tile) ? null : ticks
  }
  return { ...request, gates: { ...gates, drillTicksOf } }
}

/**
 * The carry a tick leaves: none once the tank cannot pay another tick (#7's empty tank), whatever
 * emptied it, the walk's cells or the stamp's.
 */
export function carryLeftAfter(state: AuthorityState, playerId: string, carry: number): number {
  return vehicleOf(state, playerId).energy < ENERGY_QUANTA_PER_TICK.drill ? 0 : carry
}

/** The yielded cells with the walk's paid cells first, in walk order, the rest as they were. */
export function yieldedInWalkOrder(
  yielded: readonly YieldedCell[],
  paid: readonly TilePoint[],
): YieldedCell[] {
  const byKey = new Map(yielded.map((cell) => [keyOf(cell.tile), cell]))
  const paidKeys = new Set(paid.map(keyOf))
  const walked = paid.flatMap((tile) => byKey.get(keyOf(tile)) ?? [])
  return [...walked, ...yielded.filter(({ tile }) => !paidKeys.has(keyOf(tile)))]
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
