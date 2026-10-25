/**
 * The pacing bot and each planet's merchant (ticket 826, PK7; the GD lock of 24 Oct on per-planet
 * identity P1-P5): by default it skips every merchant and reads no kit here, so the bare bot plays
 * byte-identically and is the skip-all-merchants row. Under `kitPolicy.merchant: 'buy_local_kit'`,
 * the merchants-on half of the paired replay, docked at the Sell bay after a trip it buys the
 * planet's own tool or consumable while the authority would sell one and the wallet pays it with
 * the next service and the brass reserve kept back, as a slice's optional buy is paid. What it
 * then does with the item is the item's: a tool acts by context, the flask under `kitPolicy.flask`
 * and the crate under `kitPolicy.crates`.
 */
import { botKitBuyProvider, type BotKitBuy } from '../registries/botKitBuys'
import { wouldAccept } from './botDryRun'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { canPayForBrass } from './botWallet'

/** Whether the bot buys at the merchants: never (the default), or each planet's own kit. */
export type MerchantPolicy = 'skip' | 'buy_local_kit'

/** Buys the planet's own kit at the Sell bay while one is sold here and the wallet pays it. */
export function buyLocalKit(session: BotSession, planet: BotPlanet): void {
  if (planet.pilot.kitPolicy?.merchant !== 'buy_local_kit') return
  let buy = nextPaidBuyOf(session)
  while (buy !== null) {
    session.submit(buy.intent)
    buy = nextPaidBuyOf(session)
  }
}

function nextPaidBuyOf(session: BotSession): BotKitBuy | null {
  const buy = botKitBuyProvider()?.localBuyOf(session.state(), session.playerId) ?? null
  if (buy === null || !canPayForBrass(session, buy.cost)) return null
  return wouldAccept(session, buy.intent) ? buy : null
}
