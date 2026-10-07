/**
 * The bore gun's recovery timer and its store card (the TD on ticket 322 and #313, the Systems
 * follow-up on #322 section 4). After a shot the gun waits
 *
 *   recovery = max(cooldownTicks, ceil(spentDigTicks * 100 / kGunPct))
 *
 * where `spentDigTicks` is what the shot's cells took through the drill's dig function at
 * `gunFactor * drillPower`, and both `cooldownTicks` and `kGunPct` come from the rate level at the
 * moment the shot fires. The card shows `floor(3600 / recovery)` shots a minute on the ground the
 * rig is on, from the same formula, so it cannot drift from the game. On rock the shots a minute
 * follow `kGunPct`; in open ground they follow the cooldown. Integers only.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { div, fromSafeInteger, mul, type BigStat } from '../../../systems/money'
import { ticksPerTile, type DrillStats } from '../../../systems/vehicle/drillRule'
import { GROUND_GUN } from './groundGunEconomy'
import { rateStatsAt, type RateStats } from './gunTracks'

const PERCENT = 100
const SECONDS_PER_MINUTE = 60
const TICKS_PER_MINUTE = SECONDS_PER_MINUTE * TICKS_PER_SECOND

/** What one shot bores on uniform ground: whole cells, and the dig ticks they took. */
export interface BoreShot {
  cells: number
  spentDigTicks: number
  /** The tip cannot scratch this ground: the card says so instead of a rate. */
  isBlocked: boolean
}

/** A line through air opens nothing and spends nothing: the cooldown alone sets the pace. */
export const OPEN_GROUND_SHOT: BoreShot = { cells: 0, spentDigTicks: 0, isBlocked: false }

export interface RateCard {
  recoveryTicks: number
  shotsPerMinute: number
  cellsPerMinute: number
  isBlocked: boolean
}

/** The ticks from a shot until the next is accepted, at the rate stats the shot fired with. */
export function gunRecoveryTicks(spentDigTicks: number, rate: RateStats): number {
  return Math.max(rate.cooldownTicks, ceilDiv(spentDigTicks * PERCENT, rate.kGunPct))
}

/** The drill at the gun's share of its power; the tip and the gate tip read unchanged. */
export function gunDrillOf(drill: DrillStats, gunFactorPct: number): DrillStats {
  const share = div(fromSafeInteger(gunFactorPct), fromSafeInteger(PERCENT))
  return { ...drill, drillPower: mul(drill.drillPower, share) }
}

/** Dig ticks per cell of this hardness at the gun's power, or null when the tip only skids. */
export function gunTicksPerCell(
  drill: DrillStats,
  gunFactorPct: number,
  hardness: BigStat,
): number | null {
  return ticksPerTile(gunDrillOf(drill, gunFactorPct), hardness)
}

/**
 * A shot on uniform ground of `ticksPerCell`: cells open whole or not at all, as many as the
 * budget pays for, up to the range.
 */
export function boreShotOnGround(
  rangeCells: number,
  ticksPerCell: number | null,
  shotDigTicks: number = GROUND_GUN.bore.shotDigTicks,
): BoreShot {
  if (ticksPerCell === null) return { cells: 0, spentDigTicks: 0, isBlocked: true }
  const cells = Math.min(rangeCells, Math.floor(shotDigTicks / ticksPerCell))
  return { cells, spentDigTicks: cells * ticksPerCell, isBlocked: false }
}

export function shotsPerMinuteOf(recoveryTicks: number): number {
  return Math.floor(TICKS_PER_MINUTE / recoveryTicks)
}

/** The rate track's card for `shot` at `rateLevel`: the current level; the caller asks the next. */
export function rateCardOf(rateLevel: number, shot: BoreShot): RateCard {
  const recoveryTicks = gunRecoveryTicks(shot.spentDigTicks, rateStatsAt(rateLevel))
  const shotsPerMinute = shotsPerMinuteOf(recoveryTicks)
  return {
    recoveryTicks,
    shotsPerMinute,
    cellsPerMinute: shot.cells * shotsPerMinute,
    isBlocked: shot.isBlocked,
  }
}

/** `ceil(numerator / denominator)` for whole numbers >= 0, with no float on the way. */
function ceilDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator - 1) / denominator)
}
