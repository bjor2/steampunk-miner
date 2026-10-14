/**
 * The pacing bot's hand on the consumable restock (ticket 394): the kernel bot buys no restock,
 * and a slice may not teach it to (one session, one slice), so a pace run that sprays foam plays
 * the unchanged bot through this session, which restocks the named consumables whenever the
 * vehicle stands docked at the Upgrade bay after one of the bot's own commands and a dry run says
 * the restock is accepted. Restocking at every chance is the strict end of the pace assert: the
 * most foam the restock can give, at its full price. Only specs use it.
 */
import { dockedBayOf } from '../../systems/authority/dockRules'
import { wouldAccept } from '../../systems/bot/botDryRun'
import type { BotSession } from '../../systems/bot/botSession'
import { restockConsumableIntent } from '../power-up-core'

/** `session`, restocking `itemIds` after each command it sends while docked at the Upgrade bay. */
export function withRestockHand(session: BotSession, itemIds: readonly string[]): BotSession {
  return {
    ...session,
    submit(intent) {
      const events = session.submit(intent)
      restockWhenAtUpgradeBay(session, itemIds)
      return events
    },
  }
}

function restockWhenAtUpgradeBay(session: BotSession, itemIds: readonly string[]): void {
  if (dockedBayOf(session.state(), session.playerId) !== 'upgrade') return
  itemIds
    .map(restockConsumableIntent)
    .filter((intent) => wouldAccept(session, intent))
    .forEach((intent) => session.submit(intent))
}
