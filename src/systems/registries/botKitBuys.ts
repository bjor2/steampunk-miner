/**
 * The planet's own kit the pacing bot may buy at its merchant (ticket 826, PK7; the TD's kitPolicy
 * seam on #850, which the planet kits extend field by field): the slice whose merchants sell a
 * planet's local tool or consumable names the next buy, and the kernel bot sends it only under
 * `kitPolicy.merchant: 'buy_local_kit'` (`bot/botKitBuys.ts`), never importing the slice. With no
 * provider, or the policy at its default `skip`, the bot reads nothing here and plays
 * byte-identically.
 *
 * Authority still decides: the bot dry-runs the intent before it sends it, and stops at the first
 * one refused or unpaid.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import type { Money } from '../money'
import { defineOneProviderRegistry, entriesOf } from './seal'

/** One buy at the merchant: what it sends and what it costs, for the bot's wallet check. */
export interface BotKitBuy {
  intent: CommandIntent
  cost: Money
}

export interface BotKitBuyProvider {
  id: string
  /**
   * The next buy of this planet's own kit where the vehicle is docked: its local tool not yet
   * owned, or one more of its local consumable under the carry limit; null when none is left.
   */
  localBuyOf(state: AuthorityState, playerId: string): BotKitBuy | null
}

export const BOT_KIT_BUY_REGISTRY = defineOneProviderRegistry<BotKitBuyProvider>('botKitBuys')

/** The one provider, or null when no slice registers a merchant's local kit. */
export function botKitBuyProvider(): BotKitBuyProvider | null {
  const [provider] = entriesOf(BOT_KIT_BUY_REGISTRY)
  return provider ?? null
}
