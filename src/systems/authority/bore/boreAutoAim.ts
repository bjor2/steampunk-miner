/**
 * The bore gun's auto aim (ticket 317, the #310 GD decision): the authority walks every bearing
 * of the arc (#313's table, 172 of them) with the real bore budget and the tank, as the shot would
 * open its cells through the drill's own path (`openBoreCell`), and takes the reachable cell of
 * highest sale value: what the drill pays for that ore (`oreSalePrice` of its sale tier, the
 * `CargoAdded` value), never an unrounded worth. Ties go to the fewest cells from the rig, then
 * the side the rig faces, then the lower bearing.
 *
 * "Reachable" is the authority's own state only: no slice keeps an authority-side reveal yet, so
 * any cell the bore would open counts (the TD on #310), never the client's fog. A cell already
 * yielded, or whose ore a gate says is lost, is worth nothing, and so is every cell once the
 * trip's income cap is used up. Only ore with a value is a target.
 *
 * Cost: each cell of the arc is asked once (the lines share their near cells), so a pick reads at
 * most the arc's bearings × the range in cells, inside #154's budget.
 */
import { cmp, ZERO_MONEY, type Money } from '../../money'
import { oreSalePrice } from '../../economy/oreEconomy'
import type { BoreGunStats } from '../../registries/boreGun'
import { FACING, tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { materialCellAt } from '../../world/worldState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { minedOreOf } from '../minedOre'
import { BORE_BEARING_COUNT, boreDirectionOf, isBearingInArc } from './boreAim'
import { openBoreCell, type CellOpening } from './boreCell'
import type { BoreShot } from './boreState'
import { boreCellsFrom } from './boreWalk'

/** The bearings the gun may bore, low to high: never one inside the cone below the rig. */
export const ARC_BEARINGS: readonly number[] = Array.from(
  { length: BORE_BEARING_COUNT },
  (_, bearing) => bearing,
).filter(isBearingInArc)

/** What one shot along a bearing would do: the cells it opens and the best ore among them. */
export interface PlannedShot {
  bearing: number
  /** The cells it opens, in walk order. */
  opened: readonly TilePoint[]
  /** The energy those cells take from the tank, in quanta. */
  energyQuanta: number
  /** The best ore it opens, or null when it opens none worth anything. */
  best: PlannedOre | null
}

export interface PlannedOre {
  tile: TilePoint
  value: Money
  /** Cells walked from the rig to reach it. */
  reach: number
}

/** What the planner needs besides the state: the gun's numbers and the income cap. */
export interface BoreAimAsk {
  playerId: string
  params: PlanetParams
  stats: BoreGunStats
  shot: BoreShot
  /** The trip's income cap is used up: every ore cell then scores 0. */
  isIncomeCapUsed: boolean
}

/** The best shot over the whole arc, or null when no bearing reaches ore worth anything. */
export function bestBoreShotOf(state: AuthorityState, ask: BoreAimAsk): PlannedShot | null {
  const plan = cellPlannerOf(state, ask)
  const pose = vehicleOf(state, ask.playerId).pose as VehiclePose
  return ARC_BEARINGS.map((bearing) => plannedShotAlong(state, ask, plan, pose, bearing))
    .filter(hasTarget)
    .reduce<PlannedShot | null>((kept, shot) => betterShotOf(kept, shot, pose), null)
}

/** The shot along one bearing as the ground stands now. */
export function boreShotAlong(
  state: AuthorityState,
  ask: BoreAimAsk,
  bearing: number,
): PlannedShot {
  const pose = vehicleOf(state, ask.playerId).pose as VehiclePose
  return plannedShotAlong(state, ask, cellPlannerOf(state, ask), pose, bearing)
}

/** How many cells a planner has asked: the pick's cost in cell reads. */
export function cellReadsOf(state: AuthorityState, ask: BoreAimAsk): number {
  const plan = cellPlannerOf(state, ask)
  const pose = vehicleOf(state, ask.playerId).pose as VehiclePose
  ARC_BEARINGS.forEach((bearing) => plannedShotAlong(state, ask, plan, pose, bearing))
  return plan.reads()
}

type CellPlan =
  | { kind: 'passed' }
  | { kind: 'stopped' }
  | { kind: 'opened'; ticks: number; energy: number; value: Money }

interface CellPlanner {
  planOf(tile: TilePoint): CellPlan
  reads(): number
}

/** Each cell asked once, with the whole budget: a line opens it when its budget left covers it. */
function cellPlannerOf(state: AuthorityState, ask: BoreAimAsk): CellPlanner {
  const plans = new Map<string, CellPlan>()
  return {
    planOf: (tile) => {
      const key = `${tile.tx},${tile.ty}`
      const known = plans.get(key) ?? cellPlanOf(state, ask, tile)
      plans.set(key, known)
      return known
    },
    reads: () => plans.size,
  }
}

function cellPlanOf(state: AuthorityState, ask: BoreAimAsk, tile: TilePoint): CellPlan {
  const { playerId, params, shot } = ask
  const cellAsk = { playerId, tick: state.tick, shot, budgetLeft: shot.boreBudgetTicks, tile }
  const opening = openBoreCell(state, params, cellAsk)
  if (opening.kind !== 'opened') return { kind: opening.kind === 'passed' ? 'passed' : 'stopped' }
  const value = ask.isIncomeCapUsed ? ZERO_MONEY : payOfOpening(state, params, tile, opening)
  return { kind: 'opened', ticks: opening.ticks, energy: opening.energy, value }
}

/** What the drill pays for the cell's ore, when it yields now and no gate loses it; else 0. */
function payOfOpening(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
  opening: Extract<CellOpening, { kind: 'opened' }>,
): Money {
  const cell = materialCellAt(state.world, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore || !isOreYieldKept(opening, tile)) return ZERO_MONEY
  return oreSalePrice(minedOreOf(params, tile, cell).saleTier)
}

function isOreYieldKept(
  opening: Extract<CellOpening, { kind: 'opened' }>,
  tile: TilePoint,
): boolean {
  const events = opening.effect.events
  const isYielded = events.some(
    (event) => event.type === 'TileDestroyed' && event.tx === tile.tx && event.ty === tile.ty,
  )
  return isYielded && !events.some((event) => event.type === 'DrillGated')
}

/** Walks the line as the bore would: it stops at a stop, or where the budget or the tank runs out. */
function plannedShotAlong(
  state: AuthorityState,
  ask: BoreAimAsk,
  plan: CellPlanner,
  pose: VehiclePose,
  bearing: number,
): PlannedShot {
  const walk = {
    budgetLeft: ask.shot.boreBudgetTicks,
    tankLeft: vehicleOf(state, ask.playerId).energy,
  }
  const shot: PlannedShot = { bearing, opened: [], energyQuanta: 0, best: null }
  const line = lineOfBearing(pose, bearing, ask.stats.rangeCells)
  for (const [index, tile] of line.entries()) {
    const cell = plan.planOf(tile)
    if (cell.kind === 'passed') continue
    if (cell.kind === 'stopped' || !isAffordable(cell, walk)) break
    openPlannedCell(shot, walk, cell, { tile, value: cell.value, reach: index + 1 })
  }
  return shot
}

interface PlannedWalk {
  budgetLeft: number
  tankLeft: number
}

function isAffordable(cell: { ticks: number; energy: number }, walk: PlannedWalk): boolean {
  return cell.ticks <= walk.budgetLeft && cell.energy <= walk.tankLeft
}

function openPlannedCell(
  shot: PlannedShot,
  walk: PlannedWalk,
  cell: { ticks: number; energy: number },
  ore: PlannedOre,
): void {
  walk.budgetLeft -= cell.ticks
  walk.tankLeft -= cell.energy
  shot.opened = [...shot.opened, ore.tile]
  shot.energyQuanta += cell.energy
  if (cmp(ore.value, shot.best?.value ?? ZERO_MONEY) > 0) shot.best = ore
}

function lineOfBearing(pose: VehiclePose, bearing: number, rangeCells: number): TilePoint[] {
  const up = { x: pose.upx, y: pose.upy }
  return boreCellsFrom(tileOfPose(pose), boreDirectionOf(up, bearing), rangeCells)
}

function hasTarget(shot: PlannedShot): boolean {
  return shot.best !== null
}

/** Highest value, then fewest cells, then the facing side, then the lower bearing (kept first). */
function betterShotOf(kept: PlannedShot | null, shot: PlannedShot, pose: VehiclePose): PlannedShot {
  if (kept === null) return shot
  return compareShots(shot, kept, pose) < 0 ? shot : kept
}

function compareShots(a: PlannedShot, b: PlannedShot, pose: VehiclePose): number {
  const [oreA, oreB] = [a.best as PlannedOre, b.best as PlannedOre]
  return (
    cmp(oreB.value, oreA.value) ||
    oreA.reach - oreB.reach ||
    facingRankOf(b.bearing, pose) - facingRankOf(a.bearing, pose) ||
    a.bearing - b.bearing
  )
}

/** 1 on the half of the arc the rig faces, else 0: bearing 0 is its left, 255 its right. */
function facingRankOf(bearing: number, pose: VehiclePose): number {
  const isRightHalf = bearing * 2 >= BORE_BEARING_COUNT
  if (pose.facing === FACING.right) return isRightHalf ? 1 : 0
  if (pose.facing === FACING.left) return isRightHalf ? 0 : 1
  return 0
}
