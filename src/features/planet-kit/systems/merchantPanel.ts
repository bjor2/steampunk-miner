/**
 * The merchant on the Sell bay as its panel draws it (ticket 821, PK2; the TD ruling on #821 Q3,
 * the `bayPanels` slot of #845): the merchant trading at the session's planet, its premium tag and
 * its stock, one id-keyed line per kit item with its #681 price readout. The stock is as long as
 * the rows make it; the bay's one scroll area (phone) or its pages (desktop) carry what overflows.
 * Text only, so the screen model compares by value. Buying is #850's: the panel shows what is
 * sold and its price.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { toCanonical } from '../../../systems/money'
import { merchantVariantOf, type MerchantStockRow } from './merchantVariant'
import type { PlanetKits } from './planetKitTypes'
import { sessionMerchantOf } from './sessionMerchant'

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
}

export interface MerchantPanelView {
  name: string
  premiumTag: string
  stock: readonly MerchantStockLine[]
}

/** The merchant trading at the session's planet as drawn; null where none trades. */
export function merchantPanelOf(kits: PlanetKits, state: AuthorityState): MerchantPanelView | null {
  const merchant = sessionMerchantOf(kits, state)
  const variant = merchant === null ? null : merchantVariantOf(kits, merchant.planet)
  if (variant === null) return null
  return {
    name: variant.name,
    premiumTag: variant.premiumTag,
    stock: variant.stock.map(stockLineOf),
  }
}

/** Whether a merchant trades at the session's planet: the panel row's `visibleWhen`. */
export function isMerchantTradingHere(kits: PlanetKits, state: AuthorityState): boolean {
  return sessionMerchantOf(kits, state) !== null
}

function stockLineOf(row: MerchantStockRow): MerchantStockLine {
  const [oneLine, ...rest] = sentencesOf(row.hoverLine)
  return {
    itemId: row.itemId,
    name: row.name,
    oneLine: oneLine ?? '',
    tooltipLines: [...rest, ...carryLineOf(row.stackLimit)],
    priceText: row.priceText,
    exactPrice: toCanonical(row.price),
  }
}

/** "Drop your hold as a crate. Sold only on Hearthmoor." as its two sentences. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=\.)\s+/).filter((sentence) => sentence.length > 0)
}

function carryLineOf(stackLimit: number | null): string[] {
  return stackLimit === null ? [] : [`Carry up to ${stackLimit}.`]
}
