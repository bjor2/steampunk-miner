/**
 * Mark milestones (the GD lock on #256): Marks 3, 6 and 9 of a Mark-bearing item bring a new
 * behaviour drawn from three patterns, hold, second tap and sibling-link, each used at most once.
 * Which pattern sits at which Mark follows the item's class; a class whose input cannot carry a
 * pattern leaves that Mark a plain number step. Milestones sit on the item's existing ladder: they
 * add no Mark, change no stat step and no price.
 *
 * Hold and second tap never yield. The sibling-link is an income item's one yield step, so its 15%
 * per-minute cap covers the item's levels and every milestone together (Vertical Scaler, #256).
 */
import { lastMarkOf } from './markLadder'
import type { MarkLadder, MarkMilestone, MilestonePattern } from './techNode'

/** The item classes of the #256 mapping (#162 section 2.1, toggles and always-on split). */
export type MilestoneClass = 'charged' | 'consumable' | 'channel' | 'toggle' | 'always-on'

/** The Marks a milestone may sit at, in order. */
export const MILESTONE_MARKS: readonly number[] = [3, 6, 9]

/** The #256 class mapping: the pattern at Marks 3, 6 and 9; null is a plain number step. */
const PATTERNS_OF_CLASS: Readonly<Record<MilestoneClass, readonly (MilestonePattern | null)[]>> = {
  charged: ['second-tap', 'hold', 'sibling-link'],
  consumable: ['second-tap', 'hold', 'sibling-link'],
  channel: ['second-tap', 'sibling-link', null],
  toggle: ['hold', 'second-tap', 'sibling-link'],
  'always-on': ['sibling-link', null, null],
}

/** The verbs a lane authors for one item; a pattern its class has no Mark for is left out. */
export interface MilestoneVerbs {
  hold?: string
  secondTap?: string
  siblingLink?: { verb: string; siblingId: string }
}

/** The item's milestones: its class's pattern at each milestone Mark that has a verb authored. */
export function milestonesOf(
  milestoneClass: MilestoneClass,
  verbs: MilestoneVerbs,
): MarkMilestone[] {
  return PATTERNS_OF_CLASS[milestoneClass].flatMap((pattern, index) =>
    pattern === null ? [] : authoredMilestoneOf(MILESTONE_MARKS[index], pattern, verbs),
  )
}

/** A milestone that yields ore: an income item's sibling-link, and nothing else. */
export function isYieldMilestone(ladder: MarkLadder, milestone: MarkMilestone): boolean {
  return ladder.isIncomeItem && milestone.pattern === 'sibling-link'
}

export function yieldMilestonesOf(ladder: MarkLadder): MarkMilestone[] {
  return (ladder.milestones ?? []).filter((milestone) => isYieldMilestone(ladder, milestone))
}

/** The ladder's milestones researched at `mark`, in ladder order; none for an item with no ladder. */
export function reachedMilestonesOf(ladder: MarkLadder | null, mark: number): MarkMilestone[] {
  return (ladder?.milestones ?? []).filter((milestone) => milestone.mark <= mark)
}

/** The first milestone above `mark`, the one the next Marks lead to; null with none ahead. */
export function nextMilestoneOf(ladder: MarkLadder, mark: number): MarkMilestone | null {
  const inMarkOrder = [...(ladder.milestones ?? [])].sort((a, b) => a.mark - b.mark)
  return inMarkOrder.find((milestone) => milestone.mark > mark) ?? null
}

/** What breaks the #256 shape: an empty list for a ladder with none. */
export function milestoneProblemsOf(ladder: MarkLadder): string[] {
  const milestones = ladder.milestones ?? []
  return [
    ...milestones.flatMap((milestone) => placementProblemsOf(ladder, milestone)),
    ...milestones.flatMap(siblingProblemsOf),
    ...repeatProblemsOf(milestones.map((milestone) => `Mark ${milestone.mark}`)),
    ...repeatProblemsOf(milestones.map((milestone) => `pattern ${milestone.pattern}`)),
  ]
}

function authoredMilestoneOf(
  mark: number,
  pattern: MilestonePattern,
  verbs: MilestoneVerbs,
): MarkMilestone[] {
  if (pattern === 'sibling-link') {
    return verbs.siblingLink === undefined ? [] : [{ mark, pattern, ...verbs.siblingLink }]
  }
  const verb = pattern === 'hold' ? verbs.hold : verbs.secondTap
  return verb === undefined ? [] : [{ mark, pattern, verb }]
}

function placementProblemsOf(ladder: MarkLadder, milestone: MarkMilestone): string[] {
  const { mark } = milestone
  return [
    ...(MILESTONE_MARKS.includes(mark) ? [] : [`milestone at Mark ${mark}, not 3, 6 or 9`]),
    ...(mark <= lastMarkOf(ladder) ? [] : [`milestone at Mark ${mark}, past the last Mark`]),
    ...(milestone.verb.trim().length > 0 ? [] : [`milestone at Mark ${mark} has no verb`]),
  ]
}

/** Only a sibling-link names a sibling, and it always does. */
function siblingProblemsOf(milestone: MarkMilestone): string[] {
  const isLink = milestone.pattern === 'sibling-link'
  if (isLink === (milestone.siblingId !== undefined)) return []
  const problem = isLink ? 'names no sibling' : 'names a sibling but is no sibling-link'
  return [`milestone at Mark ${milestone.mark} ${problem}`]
}

function repeatProblemsOf(names: readonly string[]): string[] {
  const repeated = names.filter((name, index) => names.indexOf(name) !== index)
  return [...new Set(repeated)].map((name) => `${name} appears more than once`)
}
