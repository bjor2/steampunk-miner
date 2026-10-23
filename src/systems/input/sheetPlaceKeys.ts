/**
 * The desktop keys that jump to a place on the base sheet (spec #678, ticket 768): one action per
 * place of `copy.places`, bound to O, P, H, L and G in `actions.json`. The routing answers them and
 * the tab bar tags the tabs with them.
 */
import type { SheetPlace } from '../views/sheetPlaces'
import type { ActionId } from './actionMap'

export const SHEET_PLACE_ACTIONS: Readonly<Record<SheetPlace, ActionId>> = {
  outfitter: 'open_outfitter',
  patentOffice: 'open_patent_office',
  hold: 'open_hold',
  ledger: 'open_ledger',
  gearbox: 'open_gearbox',
}

export const SHEET_PLACES = Object.keys(SHEET_PLACE_ACTIONS) as readonly SheetPlace[]
