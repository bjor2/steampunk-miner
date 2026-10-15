/**
 * The exact drill carry (ticket 399, the TD ruling on #399 Q1-Q5 after the #397 lock), pure and
 * integer: the work a swept tick has, `DRILL_SUBSTEPS_PER_TICK` sub-steps plus what the cursor
 * carried, walks the cells the stamp's centre crosses in order and decides how far the cut reaches.
 *
 * - **The work picks how far; the budget never does** (#335 as amended). Each crossed cell costs
 *   its price, the sub-steps to clear what is left of it in full; the walk pays cell after cell
 *   and stops before the first it cannot pay, whose part-paid work becomes the carry
 *   (0 <= carry < that cell's price). No floats, no rounding: over any column the sub-steps spent
 *   are the sum of the cells' prices, exactly.
 * - **Hard stops discard the carry**: a gated or tip-locked cell stops the walk before it with a
 *   carry of 0, so work is never banked past a gate (Horizontal Scaler).
 * - **Core, lava, a hazard, a full hold and an empty tank** keep #7's behaviour (GD ruling and TD
 *   addendum on #399): the cell is cut and charged as ever, the tick's walk ends at it and the
 *   carry drops to 0, so no burst follows. The hold and the tank are counted per cell as the walk
 *   pays, never once a tick.
 * - **A walk that reaches the stamp at the pose** banks its leftover toward the next cell along the
 *   facing, never as much as that cell's price, and nothing toward open ground or a stop. That
 *   cell comes priced with the sweep, never asked of the ground: asking a gate reports it, and a
 *   gated one discards the carry the tick the walk meets it.
 * - **Run-length batches**: a run of crossed cells alike in price, energy and kind, none ending the
 *   walk, is paid in one closed-form step (`k` cells cost `k * price`); the per-cell walk is the
 *   reference the batches must equal.
 */
import { centreTileAtStep, type SweepPath } from './sweptCut'
import type { TilePoint } from '../world/tileGrid'

/** What one crossed cell costs the walk. */
export interface CarryCell {
  /** Sub-steps to clear what is left of it in full; 0 when it is open. */
  price: number
  /** The quanta its dig costs the tank. */
  energy: number
  /** It yields an ore unit, which takes a place in the hold. */
  isOre: boolean
  /** Core, lava or a hazard: the walk ends at it, its carry dropped. */
  isCarryEnd: boolean
}

/** The ground the walk reads: hard stops, and what each crossed cell costs. */
export interface CarryGround {
  isStop: (tile: TilePoint) => boolean
  cellAt: (tile: TilePoint) => CarryCell
}

/** What a tick's walk may spend: sub-steps of work, the tank in quanta, places in the hold. */
export interface CarryPurse {
  subSteps: number
  tank: number
  room: number
}

/** How far the work reached. */
export interface CarryReach {
  /** The sub-step the cut reaches, or -1 when a fresh path could reach nothing. */
  reachedStep: number
  /** The work carried to the next tick, in sub-steps. */
  carrySubSteps: number
  /** The cells the walk paid, in walk order: each is cleared in full. */
  paid: TilePoint[]
  /** The cell the carry works toward, which only the carry cuts; null when nothing is carried. */
  target: TilePoint | null
}

/** The cell past the path's end along the facing, and its price; 0 for open ground or a stop. */
export interface BeyondCell {
  tile: TilePoint
  price: number
}

/** The sweep a tick walks: its path, and the cell past the path's end. */
export interface CarrySweep {
  path: SweepPath
  beyond: BeyondCell | null
}

/** A walk of a tick's crossed cells. */
export type CarryWalk = (sweep: CarrySweep, purse: CarryPurse, ground: CarryGround) => CarryReach

/** The reference: every crossed cell paid on its own. */
export const walkCarryPerCell: CarryWalk = (sweep, purse, ground) =>
  walkCarry(sweep, purse, ground, 1)

/** Runs of like cells paid in one closed-form step each. */
export const walkCarryInRuns: CarryWalk = (sweep, purse, ground) =>
  walkCarry(sweep, purse, ground, Number.POSITIVE_INFINITY)

/** A crossed cell: where the centre enters it, and what it costs. */
interface Crossing {
  tile: TilePoint
  step: number
  cell: CarryCell
}

/** The walk so far: what is left to spend, and the cells paid. */
interface CarryLedger {
  purse: CarryPurse
  paid: TilePoint[]
  paidKeys: Set<string>
}

function walkCarry(
  { path, beyond }: CarrySweep,
  purse: CarryPurse,
  ground: CarryGround,
  maxRun: number,
): CarryReach {
  const ledger: CarryLedger = { purse: { ...purse }, paid: [], paidKeys: new Set() }
  let run: Crossing[] = []
  for (let step = firstStepOf(path); step <= path.steps; step++) {
    const tile = centreTileAtStep(path, step)
    if (step > 0 && isSameTile(tile, centreTileAtStep(path, step - 1))) continue
    const spent = endOfSpentRun(ledger, run)
    if (spent !== null) return spent
    if (ground.isStop(tile)) return payRunThenStop(ledger, run, step)
    const crossing = { tile, step, cell: crossedCellOf(ledger, ground, tile) }
    if (isOpenCrossing(crossing)) continue
    if (run.length > 0 && !isRunOf(run, crossing, maxRun)) {
      const ended = payRun(ledger, run)
      if (ended !== null) return ended
      run = []
    }
    run.push(crossing)
  }
  return payRun(ledger, run) ?? reachOfPathEnd(ledger, path, beyond)
}

/** Open ground the walk passes for free, never in a run. */
function isOpenCrossing({ cell }: Crossing): boolean {
  return cell.price === 0 && !cell.isCarryEnd
}

/** A continuing path's start was walked by the step before; a fresh one's is crossed here. */
function firstStepOf(path: SweepPath): number {
  return path.isFresh ? 0 : 1
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

/** A cell this tick already paid costs nothing more when the centre crosses it again. */
function crossedCellOf(ledger: CarryLedger, ground: CarryGround, tile: TilePoint): CarryCell {
  const cell = ground.cellAt(tile)
  return ledger.paidKeys.has(keyOf(tile)) ? { ...cell, price: 0, isCarryEnd: false } : cell
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

/** Whether `crossing` joins the run: room left in it, and a cell alike in every cost. */
function isRunOf(run: readonly Crossing[], crossing: Crossing, maxRun: number): boolean {
  return run.length < maxRun && isAlike(run[0].cell, crossing.cell)
}

function isAlike(a: CarryCell, b: CarryCell): boolean {
  return (
    !a.isCarryEnd &&
    !b.isCarryEnd &&
    a.price === b.price &&
    a.energy === b.energy &&
    a.isOre === b.isOre
  )
}

/**
 * The walk's end inside a run the purse cannot pay in full, before the next cell is asked about:
 * the ground is never asked about a cell past where the work stops, as the per-cell walk never is
 * (asking a gate reports it).
 */
function endOfSpentRun(ledger: CarryLedger, run: readonly Crossing[]): CarryReach | null {
  if (run.length === 0) return null
  const [first] = run
  const unended = first.cell.isCarryEnd ? 0 : unendedCellsOf(first.cell, ledger.purse, run.length)
  return unended < run.length ? payRun(ledger, run) : null
}

/** The run so far is paid, then the walk stops before the hard stop at `step`, carrying nothing. */
function payRunThenStop(ledger: CarryLedger, run: readonly Crossing[], step: number): CarryReach {
  return payRun(ledger, run) ?? reachOf(ledger, step - 1, 0, null)
}

/**
 * Pays the run's cells; answers the reach when the walk ends inside it (a cell it cannot pay, or
 * one that ends the walk), else null and the ledger moved past the whole run.
 */
function payRun(ledger: CarryLedger, run: readonly Crossing[]): CarryReach | null {
  if (run.length === 0) return null
  const [first] = run
  const count = first.cell.isCarryEnd ? 0 : unendedCellsOf(first.cell, ledger.purse, run.length)
  payCells(ledger, run.slice(0, count), first.cell)
  return count === run.length ? null : payOrStopAt(ledger, run[count])
}

/**
 * How many of `length` like cells the purse pays in a row with none ending the walk: the work
 * for each, a tank each leaves unemptied, and a place in the hold for each ore unit.
 */
function unendedCellsOf(cell: CarryCell, purse: CarryPurse, length: number): number {
  const byWork = Math.floor(purse.subSteps / cell.price)
  const byTank = cell.energy > 0 ? Math.floor((purse.tank - 1) / cell.energy) : length
  const byHold = cell.isOre ? purse.room : length
  return Math.max(0, Math.min(length, byWork, byTank, byHold))
}

/** `cells`, all alike `cell`, paid in one step. */
function payCells(ledger: CarryLedger, cells: readonly Crossing[], cell: CarryCell): void {
  const count = cells.length
  ledger.purse.subSteps -= count * cell.price
  ledger.purse.tank -= count * cell.energy
  if (cell.isOre) ledger.purse.room -= count
  for (const { tile } of cells) markPaid(ledger, tile)
}

function markPaid(ledger: CarryLedger, tile: TilePoint): void {
  ledger.paid.push(tile)
  ledger.paidKeys.add(keyOf(tile))
}

/**
 * One cell decided on its own: one the work cannot pay stops the walk before it, its work carried;
 * one paid that ends the walk ends it there with nothing carried.
 */
function payOrStopAt(ledger: CarryLedger, { tile, step, cell }: Crossing): CarryReach | null {
  const { purse } = ledger
  if (cell.price > purse.subSteps) return reachOf(ledger, step - 1, purse.subSteps, tile)
  const isEnding = isWalkEndingAt(cell, purse)
  payCells(ledger, cell.price > 0 ? [{ tile, step, cell }] : [], cell)
  purse.room = Math.max(0, purse.room)
  return isEnding ? reachOf(ledger, step, 0, null) : null
}

/** Core, lava or a hazard; the cell that empties the tank; an ore unit a full hold loses. */
function isWalkEndingAt(cell: CarryCell, purse: CarryPurse): boolean {
  return cell.isCarryEnd || cell.energy >= purse.tank || (cell.isOre && purse.room === 0)
}

/**
 * The walk reached the stamp at the pose: its leftover works toward the cell past it along the
 * facing, short of that cell's price; open ground, a stop or a cell this tick paid takes nothing.
 */
function reachOfPathEnd(
  ledger: CarryLedger,
  path: SweepPath,
  beyond: BeyondCell | null,
): CarryReach {
  const price = beyond === null || ledger.paidKeys.has(keyOf(beyond.tile)) ? 0 : beyond.price
  if (beyond === null || price === 0) return reachOf(ledger, path.steps, 0, null)
  return reachOf(ledger, path.steps, Math.min(ledger.purse.subSteps, price - 1), beyond.tile)
}

function reachOf(
  ledger: CarryLedger,
  reachedStep: number,
  carrySubSteps: number,
  target: TilePoint | null,
): CarryReach {
  return { reachedStep, carrySubSteps, paid: ledger.paid, target }
}
