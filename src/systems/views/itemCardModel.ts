/**
 * The kernel item card as data (K7 #199): what a screen model hands `ItemCard` for one item. The
 * kernel keeps the card's name, icon and price (#159 lines 1 and 3, the price the authority
 * charges); the describer adds the rest. While no describer is registered `description` is null
 * and the card draws the row the screen drew before.
 */
import type { AuthorityState } from '../authority/authorityState'
import {
  describeItem,
  isItemDescriberRegistered,
  type ItemDescription,
  type ItemRef,
  type ItemSource,
} from '../registries/itemDescriber'
import { itemSnapshotViewOf } from '../registries/itemSnapshotView'
import type { AmountReading, ScreenButton } from './viewParts'

/** What the platform's screens offer is sold by the Guild's own shops. */
export const SHOP_SOURCE: ItemSource = { kind: 'shop' }

export interface ItemCardModel {
  item: ItemRef
  iconId: string
  name: string
  /** Null for what is picked, not bought (an artefact), or with nothing left to buy. */
  cost: AmountReading | null
  /** Only the price turns red when the wallet is short (#158). */
  isMoneyShort: boolean
  description: ItemDescription | null
}

/** One item as the screen shows it: its ref, the kernel's lines and what owning it means now. */
export interface ItemCardSubject {
  item: ItemRef
  iconId: string
  name: string
  cost: AmountReading | null
  /** The level, grade or count owned now. */
  level: number
  /** The button that buys or takes it, whose refusal says whether money is short. */
  buy: ScreenButton
  source?: ItemSource
}

export function itemCardOf(
  state: AuthorityState,
  playerId: string,
  subject: ItemCardSubject,
): ItemCardModel {
  return {
    item: subject.item,
    iconId: subject.iconId,
    name: subject.name,
    cost: subject.cost,
    isMoneyShort: subject.buy.reason === 'money_short',
    description: describeSubject(state, playerId, subject),
  }
}

/** `kind:id`, plus `#grade` for a computed item: the card's `data-item-card`. */
export function itemCardIdOf(item: ItemRef): string {
  return item.grade === undefined
    ? `${item.kind}:${item.id}`
    : `${item.kind}:${item.id}#${item.grade}`
}

/** A platform service (repair, recharge, quick service): nothing owned, the button's own icon. */
export function serviceCardOf(
  state: AuthorityState,
  playerId: string,
  service: {
    item: ItemRef
    name: string
    iconId: string
    button: ScreenButton
    cost: AmountReading
  },
): ItemCardModel {
  const { item, name, iconId, button, cost } = service
  const subject = { item, name, iconId, cost, level: 0, buy: button, source: SHOP_SOURCE }
  return itemCardOf(state, playerId, subject)
}

function describeSubject(
  state: AuthorityState,
  playerId: string,
  subject: ItemCardSubject,
): ItemDescription | null {
  if (!isItemDescriberRegistered()) return null
  const view = itemSnapshotViewOf(state, playerId)
  const { level, source } = subject
  return describeItem(subject.item, {
    playerId,
    planetIndex: view.planetIndex,
    level,
    source,
    view,
  })
}
