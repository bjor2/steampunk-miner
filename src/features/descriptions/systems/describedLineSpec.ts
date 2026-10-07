/**
 * A stat line spec as the descriptions slice reads it (#164): the kernel `StatLineSpec` (label,
 * track kind, raw value from a kernel or owner-slice stat function), plus optional readings a
 * contributing slice may give. All stay raw: the slice formats them, never the contributor.
 *
 * Every kernel `StatLineSpec` is one of these with no reading, so an entry another slice files
 * through `itemDescriptionEntries` is read the same way: its next value is one level on, and it
 * shows no next major and no cap.
 */
import type { Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { StatLineSpec } from '../../../systems/registries/itemDescriptionEntries'

export interface DescribedStatLineSpec extends StatLineSpec {
  /**
   * The level the card's next value is read at, or null where the line has none: a fixed figure,
   * or the item at its top. Absent: one level on from `ctx.level`.
   */
  nextLevel?(ref: ItemRef, ctx: ItemCtx): number | null
  /** Two-tier lines (#181): the level of the next major, or null with none ahead. */
  nextMajorLevel?(ref: ItemRef, ctx: ItemCtx): number | null
  /** Saturating lines: the value the stat approaches and never passes, for the cap headroom. */
  cap?(ref: ItemRef, ctx: ItemCtx): number | Money
  /**
   * A line that reads as words, not an amount (the stored step as the bay prints it, a Mark): its
   * now and next are this text at the level, with no change, share or cap.
   */
  textOf?(level: number): string
}

/** A line that never changes with the item's level: no next value. */
export function hasNoNextLevel(): null {
  return null
}
