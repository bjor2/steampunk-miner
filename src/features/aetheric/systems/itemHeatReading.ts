/**
 * The item heat gauge on the HUD (the GD ruling on #263 Q1 a): it shows only while the player owns
 * an item that adds or burns item heat (the chronometric governor or the aether condenser), never
 * previews the Fire act's heat and has no throttle line. It reads in percent of the gauge's max,
 * with the exact heat units in `exact`, so its state is said in text, never by colour alone.
 */
import { HEAT_GAUGE_ICON_ID } from '../../../systems/art/artIds'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { fromSafeInteger, toCanonical } from '../../../systems/money'
import { isItemOwned } from '../../../systems/vehicle/loadoutState'
import type { GaugeReading } from '../../../systems/views/hudModel'
import { CONDENSER_ID } from './condenserItem'
import { GOVERNOR_ID } from './governorItem'
import { gaugeMaxUnits, itemHeatUnitsAt } from './itemHeat'

/** The items that add item heat or burn it: owning one shows the gauge. */
const ITEM_HEAT_ITEM_IDS = [GOVERNOR_ID, CONDENSER_ID]

const PERCENT = 100
const PERMILLE = 1000

/** The gauge at the state's tick; null while the player owns no item heat item. */
export function itemHeatReadingOf(state: AuthorityState, playerId: string): GaugeReading | null {
  if (!ownsItemHeatItem(state, playerId)) return null
  const units = itemHeatUnitsAt(state, playerId, state.tick)
  return {
    text: `${Math.floor((units * PERCENT) / gaugeMaxUnits())}%`,
    exact: toCanonical(fromSafeInteger(units)),
    permille: Math.floor((units * PERMILLE) / gaugeMaxUnits()),
    iconId: HEAT_GAUGE_ICON_ID,
  }
}

function ownsItemHeatItem(state: AuthorityState, playerId: string): boolean {
  const { loadout } = state.players[playerId].vehicle
  return ITEM_HEAT_ITEM_IDS.some((itemId) => isItemOwned(loadout, itemId))
}
