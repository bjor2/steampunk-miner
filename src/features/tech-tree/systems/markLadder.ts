/**
 * What each Mark of an item changes (spec #162 section 4.6, the #161 Systems absorber and its
 * uptime amendment): every Mark steps the next stat that is not capped, in the fixed rotation
 * cooldown, magnitude, charges, and the item is Mastered (the gilded plate, no more Marks) once
 * all its stats are capped. A terrain magnitude also stops at the TD's cell cap, so past that cap
 * a Mark raises cooldown or charges instead.
 *
 * Mark 1 is the item as bought. Factors are `powInt` of the step (TD build rule on #161), rounded
 * to whole units before the floor or cap is applied, so a seed and version give the same ticks.
 */
import { fromSafeInteger, mul, powInt, roundToWhole, toSafeInteger } from '../../../systems/money'
import type { Money } from '../../../systems/money'
import { TREE_ECONOMY, type AbsorbLimits, type MarkAbsorb } from './treeEconomy'
import type { MarkLadder } from './techNode'

export type MarkStatName = 'cooldown' | 'magnitude' | 'charges'

const ROTATION: readonly MarkStatName[] = ['cooldown', 'magnitude', 'charges']

export interface MarkStats {
  cooldown?: number
  magnitude?: number
  charges?: number
}

export interface MarkStep {
  mark: number
  stats: MarkStats
  /** The stat this Mark changed; null for Mark 1 and past mastery. */
  stepped: MarkStatName | null
  /** Every stat is capped: this is the item's last Mark. */
  isMastered: boolean
}

type StepCounts = Readonly<Record<MarkStatName, number>>

interface LadderWalk {
  counts: StepCounts
  stepped: MarkStatName | null
}

const NO_STEPS: LadderWalk = { counts: { cooldown: 0, magnitude: 0, charges: 0 }, stepped: null }

export function markStepOf(
  ladder: MarkLadder,
  mark: number,
  absorb: MarkAbsorb = TREE_ECONOMY.markAbsorb,
): MarkStep {
  const walk = walkLadder(ladder, mark - 1, absorb)
  return {
    mark,
    stats: statsAfter(ladder, walk.counts, absorb),
    stepped: walk.stepped,
    isMastered: isEveryStatCapped(ladder, walk.counts, absorb),
  }
}

export function isMasteredAt(
  ladder: MarkLadder,
  mark: number,
  absorb: MarkAbsorb = TREE_ECONOMY.markAbsorb,
): boolean {
  return isEveryStatCapped(ladder, walkLadder(ladder, mark - 1, absorb).counts, absorb)
}

/** The Mark that masters the item: its last. 1 for a ladder with nothing to step. */
export function lastMarkOf(
  ladder: MarkLadder,
  absorb: MarkAbsorb = TREE_ECONOMY.markAbsorb,
): number {
  let walk = NO_STEPS
  let mark = 1
  for (let next = nextStatToStep(ladder, walk, absorb); next !== null; mark += 1) {
    walk = steppedWalk(walk, next)
    next = nextStatToStep(ladder, walk, absorb)
  }
  return mark
}

/** The step counts after `steps` Marks of rotation; it stops early once everything is capped. */
function walkLadder(ladder: MarkLadder, steps: number, absorb: MarkAbsorb): LadderWalk {
  let walk = NO_STEPS
  for (let step = 0; step < steps; step += 1) {
    const next = nextStatToStep(ladder, walk, absorb)
    if (next === null) return { counts: walk.counts, stepped: null }
    walk = steppedWalk(walk, next)
  }
  return walk
}

function steppedWalk(walk: LadderWalk, stat: MarkStatName): LadderWalk {
  return { counts: { ...walk.counts, [stat]: walk.counts[stat] + 1 }, stepped: stat }
}

/** The first stat after the last one stepped, in rotation, that the item has and is not capped. */
function nextStatToStep(
  ladder: MarkLadder,
  walk: LadderWalk,
  absorb: MarkAbsorb,
): MarkStatName | null {
  const start = walk.stepped === null ? 0 : ROTATION.indexOf(walk.stepped) + 1
  const order = [...ROTATION.slice(start), ...ROTATION.slice(0, start)]
  return order.find((stat) => !isStatCapped(ladder, stat, walk.counts[stat], absorb)) ?? null
}

function isEveryStatCapped(ladder: MarkLadder, counts: StepCounts, absorb: MarkAbsorb): boolean {
  return ROTATION.every((stat) => isStatCapped(ladder, stat, counts[stat], absorb))
}

/** A stat the item does not have counts as capped. */
function isStatCapped(
  ladder: MarkLadder,
  stat: MarkStatName,
  count: number,
  absorb: MarkAbsorb,
): boolean {
  if (stat === 'cooldown') return isCooldownCapped(ladder, count, absorb)
  if (stat === 'magnitude') return isMagnitudeCapped(ladder, count, absorb)
  return isChargesCapped(ladder, count, absorb)
}

function isCooldownCapped(ladder: MarkLadder, count: number, absorb: MarkAbsorb): boolean {
  if (ladder.cooldown === undefined) return true
  return scaledWhole(ladder.cooldown, absorb.cooldownStep, count) <= cooldownFloorOf(ladder, absorb)
}

function isMagnitudeCapped(ladder: MarkLadder, count: number, absorb: MarkAbsorb): boolean {
  if (ladder.magnitude === undefined) return true
  const grown = scaledWhole(ladder.magnitude.base, absorb.durationStep, count)
  return grown >= magnitudeCapOf(ladder.magnitude, limitsOf(ladder, absorb))
}

function isChargesCapped(ladder: MarkLadder, count: number, absorb: MarkAbsorb): boolean {
  return ladder.charges === undefined || count >= absorb.chargesCap
}

function statsAfter(ladder: MarkLadder, counts: StepCounts, absorb: MarkAbsorb): MarkStats {
  return {
    ...(ladder.cooldown !== undefined && {
      cooldown: Math.max(
        scaledWhole(ladder.cooldown, absorb.cooldownStep, counts.cooldown),
        cooldownFloorOf(ladder, absorb),
      ),
    }),
    ...(ladder.magnitude !== undefined && {
      magnitude: Math.min(
        scaledWhole(ladder.magnitude.base, absorb.durationStep, counts.magnitude),
        magnitudeCapOf(ladder.magnitude, limitsOf(ladder, absorb)),
      ),
    }),
    ...(ladder.charges !== undefined && { charges: ladder.charges + counts.charges }),
  }
}

function limitsOf(ladder: MarkLadder, absorb: MarkAbsorb): AbsorbLimits {
  return ladder.isIncomeItem ? absorb.income : absorb
}

function cooldownFloorOf(ladder: MarkLadder, absorb: MarkAbsorb): number {
  return wholeOf(fromSafeInteger(ladder.cooldown ?? 0), limitsOf(ladder, absorb).cooldownFloor)
}

/** The duration cap, and the terrain cap where there is one, never below the item's own size. */
function magnitudeCapOf(magnitude: { base: number; limit?: number }, limits: AbsorbLimits) {
  const capped = wholeOf(fromSafeInteger(magnitude.base), limits.durationCap)
  return Math.max(magnitude.base, Math.min(capped, magnitude.limit ?? capped))
}

/** `base * step^count`, rounded to a whole unit. */
function scaledWhole(base: number, step: Money, count: number): number {
  return wholeOf(fromSafeInteger(base), powInt(step, count))
}

function wholeOf(amount: Money, factor: Money): number {
  return toSafeInteger(roundToWhole(mul(amount, factor)))
}
