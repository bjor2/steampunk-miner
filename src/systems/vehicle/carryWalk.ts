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
 *   carry of 0, so work is never banked past a gate (Horizontal Scaler); a fresh path that starts
 *   in one reaches nothing.
 * - **The start is never priced**: it is the body's own cell on a fresh path, the cursor's on a
 *   continuing one, which the step before paid or ended in; the stamp cuts around it as ever.
 * - **Core, lava, a hazard, a full hold and an empty tank** keep #7's behaviour (GD ruling and TD
 *   addendum on #399): the cell is cut and charged as ever, the tick's walk ends at it and the
 *   carry drops to 0, so no burst follows. The hold and the tank are counted per cell as the walk
 *   pays, never once a tick.
 * - **A walk that reaches the stamp at the pose** banks its leftover toward the next cell along the
 *   facing, never as much as that cell's price, and nothing toward open ground or a stop. That
 *   cell comes priced with the sweep, never asked of the ground: asking a gate reports it, and a
 *   gated one discards the carry the tick the walk meets it.
 * - **A released cell is paid on the tick the walk meets it** (ticket 421, rule (b) of the GD ruling
 *   6204353563 in the TD's shape 6204362873): a cell the work cannot pay in full, once the stamp may
 *   carve it (`releasedPriceAt`), is priced again after the stamp's bite up to it. When that is at or
 *   under the work left, the cell is paid, its price taken and the surplus discarded, as a stop
 *   discards work, never banked forward; the walk then goes on past it with nothing left to spend,
 *   through open ground only: one cell is released a tick.
 *   It is one walk, so the purse, tank and hold are spent once.
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
  /**
   * What is left of a crossed cell, entered at sub-step `step`, once the stamp reaching the sub-step
   * before carves it; null while the carry holds it out of the stamp. Absent: every cell is held.
   */
  releasedPriceAt?: (tile: TilePoint, step: number) => number | null
}

/** What a tick's walk may spend: sub-steps of work, the tank in quanta, places in the hold. */
export interface CarryPurse {
  subSteps: number
  tank: number
  room: number
}

/** How far the work reached. */
export interface CarryReach {
  /** The sub-step the cut reaches, or -1 when a fresh path starts in a hard stop. */
  reachedStep: number
  /** The work carried to the next tick, in sub-steps. */
  carrySubSteps: number
  /** The cells the walk paid, in walk order: each is cleared in full. */
  paid: TilePoint[]
  /** What each paid cell was paid, in sub-steps, in the order of `paid`. */
  paidPrices: number[]
  /**
   * The sub-step where the stamp's centre enters each paid cell, in the order of `paid`: the stamp
   * stands at the sub-step before while it pays it (ticket 441's rim dwell, `sweepDwell.ts`).
   */
  paidSteps: number[]
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

/**
 * The walk so far: what is left to spend, the cells paid with their prices, and whether it has
 * paid its one released cell.
 */
interface CarryLedger {
  purse: CarryPurse
  paid: TilePoint[]
  paidPrices: number[]
  paidSteps: number[]
  paidKeys: Set<string>
  hasReleased: boolean
}

function walkCarry(
  { path, beyond }: CarrySweep,
  purse: CarryPurse,
  ground: CarryGround,
  maxRun: number,
): CarryReach {
  const ledger: CarryLedger = {
    purse: { ...purse },
    paid: [],
    paidPrices: [],
    paidSteps: [],
    paidKeys: new Set(),
    hasReleased: false,
  }
  if (isFreshStartStopped(path, ground)) return reachOf(ledger, -1, 0, null)
  let run: Crossing[] = []
  for (let step = 1; step <= path.steps; step++) {
    const tile = centreTileAtStep(path, step)
    if (isSameTile(tile, centreTileAtStep(path, step - 1))) continue
    if (isRunSpent(ledger, run)) {
      const ended = payRun(ledger, run, ground)
      if (ended !== null) return ended
      run = []
    }
    if (ground.isStop(tile)) return payRunThenStop(ledger, run, { step, ground })
    const crossing = { tile, step, cell: crossedCellOf(ledger, ground, tile) }
    if (isOpenCrossing(crossing)) continue
    if (run.length > 0 && !isRunOf(run, crossing, maxRun)) {
      const ended = payRun(ledger, run, ground)
      if (ended !== null) return ended
      run = []
    }
    run.push(crossing)
  }
  return payRun(ledger, run, ground) ?? reachOfPathEnd(ledger, path, beyond)
}

/** Open ground the walk passes for free, never in a run. */
function isOpenCrossing({ cell }: Crossing): boolean {
  return cell.price === 0 && !cell.isCarryEnd
}

/** A fresh path whose start, the body's own cell, is one the drill cannot cut. */
function isFreshStartStopped(path: SweepPath, ground: CarryGround): boolean {
  return path.isFresh && ground.isStop(centreTileAtStep(path, 0))
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
 * Whether the purse cannot pay the run so far in full: it is settled before the next cell is asked
 * about, so the ground is never asked about a cell past where the work stops, as the per-cell walk
 * never is (asking a gate reports it).
 */
function isRunSpent(ledger: CarryLedger, run: readonly Crossing[]): boolean {
  return run.length > 0 && unendedCellsOfRun(ledger, run) < run.length
}

function unendedCellsOfRun(ledger: CarryLedger, run: readonly Crossing[]): number {
  const [first] = run
  return first.cell.isCarryEnd ? 0 : unendedCellsOf(first.cell, ledger.purse, run.length)
}

/** Where the walk meets a hard stop, and the ground it reads. */
interface StopAt {
  step: number
  ground: CarryGround
}

/** The run so far is paid, then the walk stops before the hard stop at `step`, carrying nothing. */
function payRunThenStop(
  ledger: CarryLedger,
  run: readonly Crossing[],
  { step, ground }: StopAt,
): CarryReach {
  return payRun(ledger, run, ground) ?? reachOf(ledger, step - 1, 0, null)
}

/**
 * Pays the run's cells; answers the reach when the walk ends inside it (a cell it cannot pay, or
 * one that ends the walk), else null and the ledger moved past the whole run. A released cell paid
 * inside it leaves nothing to spend, so the rest of the run is decided cell by cell.
 */
function payRun(
  ledger: CarryLedger,
  run: readonly Crossing[],
  ground: CarryGround,
): CarryReach | null {
  if (run.length === 0) return null
  const count = unendedCellsOfRun(ledger, run)
  payCells(ledger, run.slice(0, count), run[0].cell)
  if (count === run.length) return null
  return payOrStopAt(ledger, run[count], ground) ?? payRun(ledger, run.slice(count + 1), ground)
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
  for (const crossing of cells) markPaid(ledger, crossing, cell.price)
}

function markPaid(ledger: CarryLedger, { tile, step }: Crossing, price: number): void {
  ledger.paid.push(tile)
  ledger.paidPrices.push(price)
  ledger.paidSteps.push(step)
  ledger.paidKeys.add(keyOf(tile))
}

/**
 * One cell decided on its own: one the work cannot pay stops the walk before it, its work carried,
 * unless it is a released cell the stamp's bite leaves payable; one paid that ends the walk ends it
 * there with nothing carried.
 */
function payOrStopAt(
  ledger: CarryLedger,
  crossing: Crossing,
  ground: CarryGround,
): CarryReach | null {
  const { purse } = ledger
  if (crossing.cell.price <= purse.subSteps) return payCellAt(ledger, crossing)
  const released = ledger.hasReleased ? null : releasedPriceOf(crossing, ground)
  if (released === null || released > purse.subSteps) {
    return reachOf(ledger, crossing.step - 1, purse.subSteps, crossing.tile)
  }
  return payReleasedCellAt(ledger, crossing, released)
}

/** What the stamp's bite leaves of the crossing's cell; null while the carry holds it. */
function releasedPriceOf({ tile, step }: Crossing, ground: CarryGround): number | null {
  return ground.releasedPriceAt?.(tile, step) ?? null
}

/** Pays one cell, an open one passed for nothing; the reach when it ends the walk, else null. */
function payCellAt(ledger: CarryLedger, crossing: Crossing): CarryReach | null {
  return settleCellAt(ledger, crossing, crossing.cell.price > 0 ? [crossing] : [])
}

/**
 * Pays a released cell what the stamp left of it, even nothing, so it yields where the walk crossed
 * it, and discards the rest of the work, never banked forward; the reach when it ends the walk.
 * A tick releases one cell, the one its work fell short of: past it the walk has nothing left to
 * spend, and a cell the stamp's bite emptied further on is still the carry's to pay next tick, so
 * a fast stamp's whole-tick bite never chains cells through for nothing.
 */
function payReleasedCellAt(
  ledger: CarryLedger,
  crossing: Crossing,
  price: number,
): CarryReach | null {
  ledger.purse.subSteps = price
  ledger.hasReleased = true
  const released = { ...crossing, cell: { ...crossing.cell, price } }
  return settleCellAt(ledger, released, [released])
}

/** `paid`, the crossing or nothing, paid; the reach when the crossing ends the walk, else null. */
function settleCellAt(
  ledger: CarryLedger,
  { step, cell }: Crossing,
  paid: readonly Crossing[],
): CarryReach | null {
  const { purse } = ledger
  const isEnding = isWalkEndingAt(cell, purse)
  payCells(ledger, paid, cell)
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
  const { paid, paidPrices, paidSteps } = ledger
  return { reachedStep, carrySubSteps, paid, paidPrices, paidSteps, target }
}
