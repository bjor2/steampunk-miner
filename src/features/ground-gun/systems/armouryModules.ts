/**
 * Content's module placeholders as the tree reads them (#310 node table, Systems' values on
 * ticket 322): each module's Mark 1 stats under Content's placeholder names, and the Mark ladder
 * its roles make of them for the tree's rotation (cooldown, magnitude, charges). Gun modules take
 * the income absorb limits (GD on #310); the turret's take the general ones. The two range
 * ladders are bespoke (`boreLadders.ts`) and are not here.
 */
import { markStepOf, type MarkLadder } from '../../tech-tree'
import { GROUND_GUN, type ArmouryModule } from './groundGunEconomy'

export type ModuleStats = Readonly<Record<string, number>>

export interface ModuleMarkStep {
  itemId: string
  mark: number
  stats: ModuleStats
  isMastered: boolean
}

export function armouryModuleIds(): readonly string[] {
  return Object.keys(GROUND_GUN.modules)
}

export function armouryModuleOf(itemId: string): ArmouryModule {
  const module = GROUND_GUN.modules[itemId]
  if (module === undefined) throw new RangeError(`no armoury module ${itemId}`)
  return module
}

/** The module's Mark 1 ladder: its role stats in whole units. */
export function moduleLadderOf(itemId: string): MarkLadder {
  const { marks, stats } = armouryModuleOf(itemId)
  return {
    isIncomeItem: marks.isIncomeItem,
    ...(marks.cooldown !== undefined && { cooldown: statOf(stats, marks.cooldown) }),
    ...(marks.magnitude !== undefined && { magnitude: { base: statOf(stats, marks.magnitude) } }),
    ...(marks.charges !== undefined && { charges: statOf(stats, marks.charges) }),
  }
}

/** Every stat at `mark`: the stepped ones at their Mark value, the fixed ones as bought. */
export function moduleStatsAt(itemId: string, mark: number): ModuleMarkStep {
  const { marks, stats } = armouryModuleOf(itemId)
  const step = markStepOf(moduleLadderOf(itemId), mark)
  return {
    itemId,
    mark,
    stats: {
      ...stats,
      ...steppedStat(marks.cooldown, step.stats.cooldown),
      ...steppedStat(marks.magnitude, step.stats.magnitude),
      ...steppedStat(marks.charges, step.stats.charges),
    },
    isMastered: step.isMastered,
  }
}

/**
 * Overpressure's net rate never beats the gun track's (Content's check, Systems' bound): a burst
 * fires `denominator / numerator` times the shots of its ticks, then the vent fires none, so the
 * ratio stays at or under 1 while `denominator * burst <= numerator * (burst + vent)`.
 */
export function isOverpressureNetRateHeld(stats: ModuleStats): boolean {
  const burst = statOf(stats, 'burstTicks')
  const vent = statOf(stats, 'ventTicks')
  const numerator = statOf(stats, 'burstIntervalNumerator')
  const denominator = statOf(stats, 'burstIntervalDenominator')
  return denominator * burst <= numerator * (burst + vent)
}

/** The role's stat at its Mark value; nothing for a role the module has not. */
function steppedStat(name: string | undefined, value: number | undefined): ModuleStats {
  return name === undefined || value === undefined ? {} : { [name]: value }
}

function statOf(stats: ModuleStats, name: string): number {
  const value = stats[name]
  if (value === undefined) throw new RangeError(`no module stat ${name}`)
  return value
}
