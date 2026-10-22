/**
 * What the reveal's brass plate shows (ticket 718): the bought item's icon and name under the
 * ledger entry `Gear fitted`, and what a tap does, all words from `reveal.json`. Pure, so the
 * plate's markup computes nothing.
 */
import { REVEAL, type RevealData } from './revealData'
import type { UnlockReveal } from './unlockReveal'

export interface RevealPlate {
  title: string
  name: string
  iconId: string
  /** The plate's one control, said for a screen reader: `Skip: Grapple winch`. */
  skipLabel: string
  /** `kind:id` of the bought item, for the debug read and a spec. */
  itemKey: string
  /** A gleam crosses the brass once; never under Reduce Motion (design-system section 6). */
  hasGleam: boolean
}

export function revealPlateOf(
  reveal: UnlockReveal,
  isMotionReduced: boolean,
  data: RevealData = REVEAL,
): RevealPlate {
  const { item, name, iconId } = reveal.revealed
  return {
    title: data.copy.title,
    name,
    iconId,
    skipLabel: `${data.copy.skip}: ${name}`,
    itemKey: `${item.kind}:${item.id}`,
    hasGleam: !isMotionReduced,
  }
}
