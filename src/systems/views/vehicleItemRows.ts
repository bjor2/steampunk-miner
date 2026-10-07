/**
 * The Upgrade bay's vehicle item rows (ticket 248): one row per item the tech tree unlocked that
 * the vehicle does not own yet and a slice sells on this planet, in item id order, each drawn as
 * its K7 compact card. The row's cost and the card's price are the offer `buyVehicleItem` debits,
 * read from the same seller, so the shown number is the charged one to the milli. Nothing shows
 * before research (#90: a vision row unlocks nothing and shows nothing).
 */
import type { AuthorityState } from '../authority/authorityState'
import { buyVehicleItemCommand } from '../authority/loadoutCommands'
import { vehicleItemsOnSale, type VehicleItemOnSale } from '../authority/vehicleItemRules'
import { vehicleItemRefOf } from '../registries/kernelItems'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import { UI_ID_TEMPLATES } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState } from './workshopRows'

export interface VehicleItemRow {
  itemId: string
  iconId: string
  label: string
  cost: AmountReading
  buy: ScreenButton
  buyState: BuyState
  isBuyOpen: boolean
  /** The kernel item card this row draws as, compact (K7 #199). */
  card: ItemCardModel
}

/** Not owned yet: the card reads the item as bought, Mark 1. */
const UNOWNED_LEVEL = 0

export function vehicleItemRowsOf(state: AuthorityState, playerId: string): VehicleItemRow[] {
  return vehicleItemsOnSale(state, playerId).map((onSale) =>
    vehicleItemRowOf(state, playerId, onSale),
  )
}

function vehicleItemRowOf(
  state: AuthorityState,
  playerId: string,
  { item, offer }: VehicleItemOnSale,
): VehicleItemRow {
  const buy = commandButton(
    state,
    playerId,
    UI_ID_TEMPLATES.upgradebayItemBuy(item.id),
    'Buy',
    buyVehicleItemCommand(item.id),
  )
  const cost = amountReading(offer.price)
  return {
    itemId: item.id,
    iconId: item.iconId,
    label: offer.name,
    cost,
    buy,
    buyState: buyStateOf(buy),
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: vehicleItemRefOf(item.id),
      iconId: item.iconId,
      name: offer.name,
      cost,
      level: UNOWNED_LEVEL,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}
