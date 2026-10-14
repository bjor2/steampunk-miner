/**
 * The drill and hardness rule (decision #7 "Drill and hardness rule", constants from #6 section 1):
 *
 *   r   = min(1, P / H)                     P = drill tip, H = tile hardness
 *   eff = (r < 1/4) ? 0 : r * r
 *   ticksPerTile = max(m, ceil(60 * H / (D * eff)))     D = drill power, m = minTicksPerTile
 *
 * `m` is a stopgap floor of 4 ticks, 15 tiles/s (ticket 396, lifted from #7's 24-tick, 2.5 tiles/s
 * cap): Bjor ruled on 8 Oct that drill speed has no cap, and #397 removes the floor from this law.
 *
 * The authority accumulates drill work on a tile one tick at a time (#3, #4), so the rule is kept
 * exact by working in units scaled by `H^2 * minTicks`: one tick adds `min(D * min(P, H)^2 * m,
 * 60 * H^3)` and the tile breaks at `60 * m * H^3` (m = minTicksPerTile). That is the same tick
 * count as the formula above with no division at all, so it never drifts by a tick.
 *
 * The scratch floor is a gate, so it compares the tip of the last completed major (#180 amendment
 * 2): a cell opens on a big level-up, never on a pip. The efficiency reads the live tip. A cell may
 * bring its own floor (#142: a drill-gated signature's is 1, so `P >= H`); every rule here takes
 * it last and falls back to the global `drill.scratchFloor`.
 *
 * The swept cut (ticket 330) reads the same rule in `DRILL_SUBSTEPS_PER_TICK` sub-steps instead of
 * whole ticks (`subStepsPerTile`): the floor still binds at `minTicksPerTile` ticks, but a cell is
 * no longer rounded up to the next whole tick.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ECONOMY } from '../economy/economy'
import {
  ZERO_MONEY,
  ceil,
  cmp,
  div,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type BigStat,
} from '../money'

export interface DrillStats {
  drillPower: BigStat
  drillTip: BigStat
  /** The tip of the last completed major, which the scratch floor compares. */
  gateTip: BigStat
}

const TICKS = fromSafeInteger(TICKS_PER_SECOND)
const MIN_TICKS = fromSafeInteger(ECONOMY.drill.minTicksPerTile)
const SCRATCH_FLOOR = ECONOMY.drill.scratchFloor

/** `P >= H/4`: below that the tip only skids, with no damage and no energy drain (#7). */
export function canScratch(
  tip: BigStat,
  hardness: BigStat,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): boolean {
  return cmp(tip, mul(hardness, scratchFloor)) >= 0
}

/** `eff` of #7: 0 below the scratch floor, else `min(1, P/H)^2`. */
export function drillEfficiency(
  drill: DrillStats,
  hardness: BigStat,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): BigStat {
  if (!canScratch(drill.gateTip, hardness, scratchFloor)) return ZERO_MONEY
  const ratio = div(effectiveTip(drill.drillTip, hardness), hardness)
  return mul(ratio, ratio)
}

/** The drill work one tick adds to a tile of this hardness (see the module comment). */
export function drillWorkPerTick(
  drill: DrillStats,
  hardness: BigStat,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): BigStat {
  if (!canScratch(drill.gateTip, hardness, scratchFloor)) return ZERO_MONEY
  const tip = effectiveTip(drill.drillTip, hardness)
  const uncapped = mul(mul(drill.drillPower, mul(tip, tip)), MIN_TICKS)
  return smallerOf(uncapped, capPerTick(hardness))
}

/** The work at which a tile of this hardness breaks: `60 * m * H^3`. */
export function tileWorkToBreak(hardness: BigStat): BigStat {
  return mul(capPerTick(hardness), MIN_TICKS)
}

/** Whole ticks to break an intact tile, or null when the tip cannot scratch it. */
export function ticksPerTile(
  drill: DrillStats,
  hardness: BigStat,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): number | null {
  return tileTimeIn(1, drill, hardness, scratchFloor)
}

/**
 * `ticksPerTile` in `DRILL_SUBSTEPS_PER_TICK` sub-steps of a tick, rounded up once to a whole
 * sub-step, or null when the tip cannot scratch the tile.
 */
export function subStepsPerTile(
  drill: DrillStats,
  hardness: BigStat,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): number | null {
  return tileTimeIn(DRILL_SUBSTEPS_PER_TICK, drill, hardness, scratchFloor)
}

/**
 * A tile's drill time in `unitsPerTick` units of a tick. A tick whose work is held to the cap
 * takes exactly the floor: `60 * m * H^3` over `60 * H^3` rounded to 40 digits can land a hair
 * over `m` and round up to a whole extra unit (ticket 396).
 */
function tileTimeIn(
  unitsPerTick: number,
  drill: DrillStats,
  hardness: BigStat,
  scratchFloor: BigStat,
): number | null {
  const work = drillWorkPerTick(drill, hardness, scratchFloor)
  if (cmp(work, ZERO_MONEY) === 0) return null
  if (cmp(work, capPerTick(hardness)) === 0) return ECONOMY.drill.minTicksPerTile * unitsPerTick
  const units = mul(tileWorkToBreak(hardness), fromSafeInteger(unitsPerTick))
  return toSafeInteger(ceil(div(units, work)))
}

/**
 * The damage `ticks` of drilling deal in hardness units, for `drill_damage_dealt`:
 * `ticks * D * eff / 60`, with `D * eff` held to the tile speed cap.
 */
export function drillDamage(
  drill: DrillStats,
  hardness: BigStat,
  ticks: number,
  scratchFloor: BigStat = SCRATCH_FLOOR,
): BigStat {
  const perSecond = smallerOf(
    mul(drill.drillPower, drillEfficiency(drill, hardness, scratchFloor)),
    div(mul(hardness, TICKS), MIN_TICKS),
  )
  return div(mul(perSecond, fromSafeInteger(ticks)), TICKS)
}

function effectiveTip(tip: BigStat, hardness: BigStat): BigStat {
  return smallerOf(tip, hardness)
}

/** `60 * H^3`: one tick never does more than a tile's worth over the minimum tick count. */
function capPerTick(hardness: BigStat): BigStat {
  return mul(TICKS, mul(hardness, mul(hardness, hardness)))
}

function smallerOf(a: BigStat, b: BigStat): BigStat {
  return cmp(a, b) <= 0 ? a : b
}
