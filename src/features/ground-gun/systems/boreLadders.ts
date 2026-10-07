/**
 * The two range ladders (the GD decision and amendment on #310, Content's range ladder section):
 * each Mark adds a cell or a tile up to its hard cap, and later Marks step a second stat until
 * the item is Mastered. Mark 1 is the item as bought.
 *
 * - Long barrel: `range = min(rangeCap, boreRangeBase + N)` cells, then `holdStep` ticks on the
 *   hold before an uncased bore is checked, up to `holdCap`. The hold stays under the collapse
 *   warning, so a weak block always warns and collapse always happens.
 * - Extended barrels: +1 tile on the turret's range to `gunRangeCap`, then energy per shot x0.92
 *   a Mark to its 0.5 floor (the tree's general cooldown rotation, in thousandths of a unit).
 */
import { ECONOMY } from '../../../systems/economy/economy'
import { gunRangeTiles } from '../../../systems/economy/gunStats'
import { fromSafeInteger, mul, toSafeInteger } from '../../../systems/money'
import { isMasteredAt, markStepOf, type MarkLadder } from '../../tech-tree'
import { GROUND_GUN } from './groundGunEconomy'

const FIRST_MARK = 1
/** Energy per shot is stepped in thousandths of a unit, the money quantum, so it stays whole. */
const MILLI_PER_UNIT = 1000

export interface LongBarrelStep {
  mark: number
  rangeCells: number
  /** Ticks added to the bore's hold before its collapse check. */
  holdTicks: number
  isMastered: boolean
}

export interface ExtendedBarrelsStep {
  mark: number
  rangeTiles: number
  /** Thousandths of an energy unit one turret shot costs. */
  energyPerShotMilli: number
  isMastered: boolean
}

/** The range Marks: one cell a Mark from the base to the cap. */
export function longBarrelRangeMarks(): number {
  return GROUND_GUN.bore.rangeCap - GROUND_GUN.bore.boreRangeBase
}

export function longBarrelAt(mark: number): LongBarrelStep {
  const { bore, longBarrel } = GROUND_GUN
  const rangeCells = Math.min(bore.rangeCap, bore.boreRangeBase + mark)
  const holdMarks = Math.max(0, mark - longBarrelRangeMarks())
  const holdTicks = Math.min(longBarrel.holdCap, longBarrel.holdStep * holdMarks)
  return { mark, rangeCells, holdTicks, isMastered: mark >= longBarrelMasteredMark() }
}

/** The Mark at which the range is capped and the hold at its cap: the long barrel's last. */
export function longBarrelMasteredMark(): number {
  const { holdStep, holdCap } = GROUND_GUN.longBarrel
  return longBarrelRangeMarks() + Math.ceil(holdCap / holdStep)
}

/** The turret's range Marks: one tile a Mark from today's range to the cap. */
export function extendedBarrelsRangeMarks(): number {
  return GROUND_GUN.turret.gunRangeCap - gunRangeTiles()
}

export function extendedBarrelsAt(mark: number): ExtendedBarrelsStep {
  const rangeTiles = Math.min(GROUND_GUN.turret.gunRangeCap, gunRangeTiles() + mark)
  const energyMark = Math.max(FIRST_MARK, mark - extendedBarrelsRangeMarks() + FIRST_MARK)
  const energy = markStepOf(energyPerShotLadder(), energyMark)
  return {
    mark,
    rangeTiles,
    energyPerShotMilli: energy.stats.cooldown ?? energyPerShotMilliAsBought(),
    isMastered:
      rangeTiles === GROUND_GUN.turret.gunRangeCap &&
      isMasteredAt(energyPerShotLadder(), energyMark),
  }
}

/** The past-cap stat as a tree ladder: a general-limits cooldown in thousandths of a unit. */
export function energyPerShotLadder(): MarkLadder {
  return { isIncomeItem: false, cooldown: energyPerShotMilliAsBought() }
}

function energyPerShotMilliAsBought(): number {
  return toSafeInteger(mul(ECONOMY.energy.perShot, fromSafeInteger(MILLI_PER_UNIT)))
}
