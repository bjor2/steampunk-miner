/**
 * The brass key tags desktop draws (spec #678, ticket 768; Progression's key tags in the GD lock
 * of 23 Oct): the key that presses a tool slot cell, jumps to a sheet tab or opens the star map
 * (ticket 769), as the player reads
 * it from the bindings in force, so a rebinding shows at once. A phone draws none. Pure.
 */
import { tabAtPlace, type SheetPlace } from '../views/sheetPlaces'
import { boundLabel, type ActionId, type Bindings } from './actionMap'
import { keyLabelOf } from './keyCodes'
import { SHEET_PLACE_ACTIONS, SHEET_PLACES } from './sheetPlaceKeys'
import { hotkeyOfPosition } from './toolSlots'

/**
 * The key of cell `cell` holding a tool that presses `action`: its number key while that key
 * reaches it (always on a turned tray page, ticket 768), else the action's own first key; null
 * with no key at all.
 */
export function toolCellKeyLabelOf(
  cell: number,
  action: ActionId,
  page: number,
  bindings: Bindings,
): string | null {
  const hotkey = hotkeyOfPosition(cell)
  const isNumberKeyed = hotkey !== null && (page > 0 || bindings[action].includes(hotkey))
  if (isNumberKeyed) return keyLabelOf(hotkey)
  return bindings[action].length > 0 ? boundLabel(bindings, action) : null
}

/** Each shown tab that bears a place's word, by tab id, with the key that jumps to it. */
export function sheetTabKeyLabelsOf(
  tabs: readonly { id: string; title: string }[],
  bindings: Bindings,
): Readonly<Record<string, string>> {
  return Object.fromEntries(SHEET_PLACES.flatMap((place) => placeKeyEntryOf(tabs, place, bindings)))
}

/** The star map button's key (ticket 769): `open_star_map`'s first key; null with none bound. */
export function starMapKeyLabelOf(bindings: Bindings): string | null {
  return bindings.open_star_map.length > 0 ? boundLabel(bindings, 'open_star_map') : null
}

function placeKeyEntryOf(
  tabs: readonly { id: string; title: string }[],
  place: SheetPlace,
  bindings: Bindings,
): [string, string][] {
  const tab = tabAtPlace(tabs, place)
  const action = SHEET_PLACE_ACTIONS[place]
  if (tab === null || bindings[action].length === 0) return []
  return [[tab.id, boundLabel(bindings, action)]]
}
