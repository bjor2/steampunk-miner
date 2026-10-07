/**
 * The next milestone in one card line (the GD lock on #256: "the #164 card shows the next
 * milestone's verb in one line"), so a Mark buy previews a behaviour, not only a number. It is the
 * words beside the numbers each lane's `statPreview` steps through: a lane adds the line to its
 * item's card entry, and an item with no milestones gets no line, so its card is unchanged.
 */
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { nextMilestoneOf } from './markMilestones'
import { romanNumeralOf } from './nodeCardModel'
import type { MarkLadder, MilestonePattern } from './techNode'

export const MILESTONE_LINE_LABEL = 'Next milestone'

/** What the line says once the last milestone is researched. */
export const NO_MILESTONE_AHEAD_TEXT = 'All reached'

const PATTERN_WORDS: Readonly<Record<MilestonePattern, string>> = {
  hold: 'hold',
  'second-tap': 'tap twice',
  'sibling-link': 'link',
}

/** "Mk VI, hold: a longer burn": the first milestone above `mark`; null with none ahead. */
export function nextMilestoneLineOf(ladder: MarkLadder, mark: number): string | null {
  const milestone = nextMilestoneOf(ladder, mark)
  if (milestone === null) return null
  return `Mk ${romanNumeralOf(milestone.mark)}, ${PATTERN_WORDS[milestone.pattern]}: ${milestone.verb}`
}

/**
 * The card's milestone line for an item with this ladder, read at the Mark the card's level names;
 * none for an item without milestones. It has no next value: the line already looks ahead.
 */
export function milestoneLineSpecsOf(ladder: MarkLadder | null): DescribedStatLineSpec[] {
  if (ladder === null || (ladder.milestones ?? []).length === 0) return []
  return [
    {
      label: MILESTONE_LINE_LABEL,
      kind: 'linearInt',
      value: (_ref, ctx) => ctx.level,
      nextLevel: hasNoNextLevel,
      textOf: (level) => nextMilestoneLineOf(ladder, level) ?? NO_MILESTONE_AHEAD_TEXT,
    },
  ]
}
