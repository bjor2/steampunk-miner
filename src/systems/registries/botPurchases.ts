/**
 * What the pacing bot may buy from a slice (#165 Q3 lock, ticket 211): a slice registers the
 * command it adds and how the bot judges it; the bot tries these after the kernel's own Upgrade
 * bay purchases, never importing a slice. Authority still decides and charges; `estimateCost` only
 * feeds the bot's wallet check and its spend-share diagnostic. With none registered, the bot
 * plays exactly as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { Money } from '../money'
import { defineRegistry, entriesOf } from './seal'

export interface BotPurchase {
  id: string
  /** Slice command type the bot may issue, e.g. 'tech-tree.unlock_node'. */
  command: string
  /**
   * The payloads the bot may send with `command` now, best first; each is the `args` the two
   * judgements below receive. The Q3 shape left the payload's source open; one call keeps the
   * choice (which node, which slot) inside the slice.
   */
  payloadsToTry(state: AuthorityState, playerId: string): readonly unknown[]
  /** Soft cost estimate for the spend-share diagnostic; authority still charges. */
  estimateCost(state: AuthorityState, playerId: string, args: unknown): Money
  /** True when the bot may attempt this purchase now. */
  isAvailable(state: AuthorityState, playerId: string, args: unknown): boolean
  /**
   * The id of what `args` buys (a node, an item), kept on the bot's spend record so a slice can
   * split its spend by what was bought (ticket 248: #212 reads it per lane); optional.
   */
  boughtIdOf?(args: unknown): string
  /**
   * The payloads due ahead of the kernel's track levels now, money aside (ticket 296: an
   * extractor on its planet, #142 acceptance 7). The bot buys them before its other purchases
   * and, while one is listed that the wallet cannot pay, saves for it: no track level and no other
   * slice purchase. A payload listed here must be one the authority accepts once paid for, or the
   * bot saves for good. Optional: nothing is due.
   */
  duePayloadsOf?(state: AuthorityState, playerId: string): readonly unknown[]
}

export const BOT_PURCHASE_REGISTRY = defineRegistry<BotPurchase>('botPurchases')

/** Every registered purchase, sorted by id. */
export function botPurchases(): readonly BotPurchase[] {
  return entriesOf(BOT_PURCHASE_REGISTRY)
}
