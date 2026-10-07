/**
 * A power-up at the Mark the player researched (#249, spec #162 section 4.6, the GD lock on #204
 * Q7): the item's ladder stepped to that Mark with `markStepOf` gives its charges or stack, its
 * cooldown, a toggle's energy draw and the magnitude its effect reads. A use reads it when it
 * acts, and the cooldown it starts is kept as a tick, so a Mark researched mid-cooldown shortens
 * the next cooldown, never the running one.
 *
 * The Mark comes from `tech-tree`'s `unlockedItems`. An item the player researched none of (owned
 * through a debug loadout) acts as bought, at Mark 1, and logs Mark 0; an item whose capability
 * carries no ladder acts at its own numbers.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  markLadderOfItem,
  markStepOf,
  researchedMarkOf,
  type MarkLadder,
  type MarkStep,
  type MilestonePattern,
} from '../../tech-tree'
import { powerUpOfItem, type PowerUp } from './powerUpKind'

export interface MarkedPowerUp extends PowerUp {
  /** The highest Mark researched; 0 for none. */
  mark: number
  /** The ladder's magnitude at the Mark: a time, a range or a share; null with none. */
  magnitude: number | null
  /** Every stat is capped: the gilded plate. */
  isMastered: boolean
  /** The milestone patterns the researched Mark has reached (#256: Marks 3, 6 and 9). */
  reachedMilestones: readonly MilestonePattern[]
}

/** Mark 1 is the item as bought (#162 4.6). */
const BOUGHT_MARK = 1

/** The power-up registered for the item at the player's Mark; null for an item that is not one. */
export function powerUpAtMarkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): MarkedPowerUp | null {
  const powerUp = powerUpOfItem(itemId)
  return powerUp === null ? null : atResearchedMark(state, playerId, powerUp)
}

export function atResearchedMark(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
): MarkedPowerUp {
  const mark = researchedMarkOf(state, playerId, powerUp.itemId)
  const ladder = markLadderOfItem(powerUp.itemId)
  if (ladder === null) {
    return { ...powerUp, mark, magnitude: null, isMastered: false, reachedMilestones: [] }
  }
  return steppedPowerUpOf(powerUp, mark, ladder)
}

function steppedPowerUpOf(powerUp: PowerUp, mark: number, ladder: MarkLadder): MarkedPowerUp {
  const step: MarkStep = markStepOf(ladder, Math.max(mark, BOUGHT_MARK))
  const { cooldown, magnitude, charges } = step.stats
  return {
    ...powerUp,
    ...(charges !== undefined && { charges }),
    ...steppedCooldownOf(powerUp, cooldown),
    mark,
    magnitude: magnitude ?? null,
    isMastered: step.isMastered,
    reachedMilestones: reachedMilestonesOf(ladder, mark),
  }
}

/** A milestone acts from its own Mark on: a Mark 3 second tap is there at Marks 3 to 9. */
function reachedMilestonesOf(ladder: MarkLadder, mark: number): MilestonePattern[] {
  return (ladder.milestones ?? [])
    .filter((milestone) => milestone.mark <= mark)
    .map((milestone) => milestone.pattern)
}

/** A toggle's ladder carries its energy draw where a charged item's carries its cooldown (#162 4.6). */
function steppedCooldownOf(powerUp: PowerUp, cooldown: number | undefined): Partial<PowerUp> {
  if (cooldown === undefined) return {}
  return powerUp.isToggle ? { energyDrawBpPerSecond: cooldown } : { cooldownTicks: cooldown }
}
