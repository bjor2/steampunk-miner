/**
 * The plaque as the track's shop entry (#164's described-row contract, GD and TD, 7 Oct): once a
 * describer answers, the plaque is the track's compact item card and carries `data-item-card` and
 * the #33 buy id, open while the game's menu focus is on it. Until one answers, it keeps the #33
 * row id and the Buy keeps the buy id, as the kernel's empty fast path does.
 */
import { itemCardIdOf } from '../../../systems/views/itemCardModel'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import type { WorkshopRow } from '../../../systems/views/workshopRows'

export interface PlaqueEntry {
  hasCard: boolean
  isCardOpen: boolean
  attributes: Record<string, string | boolean>
}

export function plaqueEntryOf(row: WorkshopRow, focusedId: string): PlaqueEntry {
  const isCardOpen = focusedId === row.buy.id
  if (row.card.description === null) return rowEntryOf(row)
  return { hasCard: true, isCardOpen, attributes: cardAttributesOf(row, isCardOpen) }
}

function rowEntryOf(row: WorkshopRow): PlaqueEntry {
  const attributes = { 'data-testid': UI_ID_TEMPLATES.workshopUpgrade(row.upgradeId) }
  return { hasCard: false, isCardOpen: false, attributes }
}

function cardAttributesOf(row: WorkshopRow, isCardOpen: boolean): Record<string, string | boolean> {
  return {
    'data-testid': row.buy.id,
    'data-item-card': itemCardIdOf(row.card.item),
    'data-variant': 'compact',
    'aria-expanded': isCardOpen,
  }
}
