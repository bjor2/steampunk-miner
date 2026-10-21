/**
 * The plaque as the track's shop entry (#164's described-row contract, GD and TD, 7 Oct): once a
 * describer answers, the plaque is the track's compact item card and carries `data-item-card` and
 * the #33 buy id, open while the game's menu focus is on it. Until one answers, it keeps the #33
 * row id and the Buy keeps the buy id, as the kernel's empty fast path does.
 */
import { panelIconIdOf } from '../../../systems/art/icons/iconSet'
import { itemCardElementOf, type ItemCardElement } from '../../../systems/views/itemCardElement'
import { itemCardIdOf } from '../../../systems/views/itemCardModel'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import type { WorkshopRow } from '../../../systems/views/workshopRows'
import type { IconValue } from '../../../ui/kit/TitleOneLine'
import { rigLookPlaqueFactOf } from '../../rig-look'
import { WORKSHOP_TEST_IDS } from './testIds'

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

/**
 * The plaque on the shared Title+OneLine element (spec #422, pass #425): the track's card text,
 * its one line the stat it buys ("now → next" while no describer answers), the rest in the tooltip.
 */
export function plaqueElementOf(row: WorkshopRow): ItemCardElement {
  const element = itemCardElementOf(`workshop.plaque-${row.upgradeId}`, row.card)
  if (element.text.oneLine !== '') return element
  const oneLine = `${row.effectBefore.text} → ${row.effectAfter.text}`
  return { ...element, text: { ...element.text, oneLine } }
}

/**
 * The level and the price beside the name, each a glyph and a value, on the #33 ids; then, on a
 * track whose rig look row carries a plaque template, the step the player owns (`Fitting: …`,
 * ticket 585, TD ruling on #579). Every other plaque keeps its two facts.
 */
export function plaqueFactsOf(
  row: WorkshopRow,
  moneyIconId: string,
  priceFlashKey: number | null,
): IconValue[] {
  const id = row.upgradeId
  const level: IconValue = {
    iconId: panelIconIdOf('upgrades'),
    text: row.levelText,
    testId: UI_ID_TEMPLATES.workshopUpgradeLevel(id),
  }
  const price: IconValue = {
    iconId: moneyIconId,
    text: row.cost.text,
    exact: row.cost.exact,
    holds: 'price',
    testId: UI_ID_TEMPLATES.workshopUpgradeCost(id),
    isMoneyShort: row.buyState === 'money_short',
    ...(priceFlashKey === null ? {} : { flashKey: priceFlashKey }),
  }
  return [level, price, ...fittingFactsOf(row)]
}

/** The owned rig look step on the track's own glyph; none below the first step or untemplated. */
function fittingFactsOf(row: WorkshopRow): IconValue[] {
  const text = rigLookPlaqueFactOf(row.upgradeId, row.level)
  if (text === null) return []
  return [{ iconId: row.iconId, text, testId: WORKSHOP_TEST_IDS.plaqueFitting(row.upgradeId) }]
}
