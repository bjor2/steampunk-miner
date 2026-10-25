/**
 * The merchant on the Sell bay as its panel draws it (ticket 821, PK2; the TD ruling on #821 Q3,
 * the `bayPanels` slot of #845): the merchant trading at the session's planet, its premium tag and
 * its stock, one id-keyed line per kit item with its #681 price readout. The stock is as long as
 * the rows make it; the bay's one scroll area (phone) or its pages (desktop) carry what overflows.
 * Text only, so the screen model compares by value. Each line carries what the player's Buy
 * would meet (ticket 850): a tool already owned or a consumable carried to its limit is locked with
 * the reason on the line, a consumable shows how many are carried, and a price the wallet cannot
 * pay turns red. The authority still decides; the line only says it ahead.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { cmp, toCanonical, type Money } from '../../../systems/money'
import { kitBuyRefusalOf, unitsHeldOf, type KitHoldings } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'
import { kitItemIconIdOf } from './kitItemContent'
import { merchantVariantOf, type MerchantStockRow } from './merchantVariant'
import type { PlanetKits } from './planetKitTypes'
import { sessionMerchantOf } from './sessionMerchant'

/** What the player holds and can pay, as each line reads it. */
interface Buyer {
  holdings: KitHoldings
  wallet: Money
}

export interface MerchantStockLine {
  itemId: string
  name: string
  /** The hover line's first sentence: what the item does. */
  oneLine: string
  /** The hover line's other sentences, then a consumable's carry limit. */
  tooltipLines: readonly string[]
  priceText: string
  /** The canonical price behind the readout, for `data-exact`. */
  exactPrice: string
  /** The item's icon, drawn beside a consumable's carried count. */
  iconId: string
  /** "2/3": a consumable's units carried and its carry limit; null for a tool. */
  carriedText: string | null
  /** Why Buy is shut ("Owned.", "Carrying the most."); null while it is open. */
  lockReason: string | null
  /** The wallet cannot pay the price: only the price turns red. */
  isMoneyShort: boolean
}

export interface MerchantPanelView {
  name: string
  premiumTag: string
  stock: readonly MerchantStockLine[]
}

export const OWNED_LOCK_REASON = 'Owned.'
export const CARRIED_FULL_LOCK_REASON = 'Carrying the most.'

/** The merchant trading at the session's planet as `playerId` sees it; null where none trades. */
export function merchantPanelOf(
  kits: PlanetKits,
  state: AuthorityState,
  playerId: string,
): MerchantPanelView | null {
  const merchant = sessionMerchantOf(kits, state)
  const variant = merchant === null ? null : merchantVariantOf(kits, merchant.planet)
  if (variant === null) return null
  const buyer = buyerOf(state, playerId)
  return {
    name: variant.name,
    premiumTag: variant.premiumTag,
    stock: variant.stock.map((row) => stockLineOf(row, buyer)),
  }
}

/** Whether a merchant trades at the session's planet: the panel row's `visibleWhen`. */
export function isMerchantTradingHere(kits: PlanetKits, state: AuthorityState): boolean {
  return sessionMerchantOf(kits, state) !== null
}

function buyerOf(state: AuthorityState, playerId: string): Buyer {
  return { holdings: kitHoldingsOf(state, playerId), wallet: state.players[playerId].wallet }
}

function stockLineOf(row: MerchantStockRow, buyer: Buyer): MerchantStockLine {
  const [oneLine, ...rest] = sentencesOf(row.hoverLine)
  return {
    itemId: row.itemId,
    name: row.name,
    oneLine: oneLine ?? '',
    tooltipLines: [...rest, ...carryLineOf(row.stackLimit)],
    priceText: row.priceText,
    exactPrice: toCanonical(row.price),
    iconId: kitItemIconIdOf(row.itemId),
    carriedText: carriedTextOf(row, buyer.holdings),
    lockReason: lockReasonOf(row, buyer.holdings),
    isMoneyShort: cmp(buyer.wallet, row.price) < 0,
  }
}

function carriedTextOf(row: MerchantStockRow, holdings: KitHoldings): string | null {
  if (row.stackLimit === null) return null
  return `${unitsHeldOf(holdings, { id: row.itemId, stackLimit: row.stackLimit })}/${row.stackLimit}`
}

function lockReasonOf(row: MerchantStockRow, holdings: KitHoldings): string | null {
  const refusal = kitBuyRefusalOf(holdings, { id: row.itemId, stackLimit: row.stackLimit })
  if (refusal === null) return null
  return refusal === 'kit_tool_owned' ? OWNED_LOCK_REASON : CARRIED_FULL_LOCK_REASON
}

/** "Drop your hold as a crate. Sold only on Hearthmoor." as its two sentences. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=\.)\s+/).filter((sentence) => sentence.length > 0)
}

function carryLineOf(stackLimit: number | null): string[] {
  return stackLimit === null ? [] : [`Carry up to ${stackLimit}.`]
}
