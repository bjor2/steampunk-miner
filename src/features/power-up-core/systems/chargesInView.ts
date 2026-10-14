/**
 * Charges left as an item card reads them (ticket 394; K7: a card reads the snapshot view, never
 * authority state): the charges or stack at the Mark the view shows researched, less those spent,
 * as `chargesLeftOf` counts them. A consumable's card prints it beside its restock price.
 */
import type { ItemSnapshotView } from '../../../systems/registries/itemSnapshotView'
import { researchedMarkInViewOf } from '../../tech-tree'
import { chargesLeftIn, POWER_UP_SECTION } from './chargeState'
import { hasCharges, powerUpOfItem } from './powerUpKind'
import { atMarkOf } from './powerUpMarks'

/** 0 for an item that counts no charges or is no power-up. */
export function chargesLeftInViewOf(view: ItemSnapshotView, itemId: string): number {
  const powerUp = powerUpOfItem(itemId)
  if (powerUp === null || !hasCharges(powerUp)) return 0
  const marked = atMarkOf(powerUp, researchedMarkInViewOf(view, itemId))
  return chargesLeftIn(view.section(POWER_UP_SECTION), marked)
}
