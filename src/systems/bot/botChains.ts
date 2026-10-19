/**
 * Whether the pacing bot holds the buy button (#180 section 2, ticket 226): with `hold`, the
 * consecutive steps it buys on one track in a visit share one chain id, so each is a held step the
 * authority refuses under the service reserve, and the bot leaves the bay at the first refusal as
 * a player's hold stops there. With `click` every buy is a click (`chain` 0), as before #180.
 * The authority judges a held step by the reserve before it, so a step that raises the reserve (a
 * boiler or hull step) could end the hold under it; the bot also stops before such a step unless
 * the wallet still holds the reserve after it (ticket 553, `trackStepsOutlayOf`).
 *
 * `click` is the default until the combined 3-seed P3-P10 re-baseline with #146, #195 and #225
 * turns `hold` on (TD and GD locks on #177): only then may the bot's pace move.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { serviceReserveOf } from '../authority/serviceReserve'
import { nextUpgradePrice } from '../authority/workshopRules'
import type { UpgradeId } from '../economy/economyDefinition'
import { cmp, sub } from '../money'
import type { BotSession } from './botSession'
import { wouldAccept } from './botDryRun'
import { trackStepsOutlayOf, walletOf } from './botWallet'

export type ChainPolicy = 'click' | 'hold'

export const DEFAULT_CHAIN_POLICY: ChainPolicy = 'click'

/** The hold the bot is in during one Upgrade bay visit: the track it holds and the hold's id. */
export interface BotHold {
  readonly policy: ChainPolicy
  track: string | null
  chain: number
}

export function startBotHold(policy: ChainPolicy): BotHold {
  return { policy, track: null, chain: CLICK_CHAIN }
}

/**
 * The purchase as the bot sends it: a track step continues the hold on its track or starts a new
 * one, anything else ends the hold and stays a click. Null when the held step would be refused,
 * which ends the visit's buying.
 */
export function stepOfHold(
  session: BotSession,
  hold: BotHold,
  pick: CommandIntent,
): CommandIntent | null {
  if (hold.policy === 'click') return pick
  if (pick.type !== 'buyUpgrade') return releasedPick(hold, pick)
  const step = heldUpgradeStep(session, hold, pick.payload.upgradeId)
  return wouldAccept(session, step) && leavesReserveAfter(session, step) ? step : null
}

/** The wallet still holds the service reserve once the step is bought and has raised it. */
function leavesReserveAfter(session: BotSession, step: CommandIntent<'buyUpgrade'>): boolean {
  const track = step.payload.upgradeId as UpgradeId
  const price = nextUpgradePrice(session.state(), session.playerId, track)
  const outlay = trackStepsOutlayOf(session, { track, steps: 1, price })
  const reserve = serviceReserveOf(session.state(), session.playerId)
  return cmp(sub(walletOf(session), outlay), reserve) >= 0
}

function releasedPick(hold: BotHold, pick: CommandIntent): CommandIntent {
  hold.track = null
  return pick
}

function heldUpgradeStep(
  session: BotSession,
  hold: BotHold,
  upgradeId: string,
): CommandIntent<'buyUpgrade'> {
  if (hold.track !== upgradeId) pressTrack(session, hold, upgradeId)
  return { type: 'buyUpgrade', payload: { upgradeId, chain: hold.chain } }
}

/** A new hold's id: one past the commands the session has sent, so no two holds share one. */
function pressTrack(session: BotSession, hold: BotHold, upgradeId: string): void {
  hold.track = upgradeId
  hold.chain = session.commands().length + 1
}
