/**
 * The greedy rush bot (the Vertical Scaler's point 2 on #411): with the tree gated by price alone, a
 * player may research a throughput node long before its anchor, so the run that does is the one
 * the growth asserts hold the prices to. The kernel bot keeps its schedule and a slice may not
 * teach it otherwise (one session, one slice), so the rush plays the unchanged pacing bot through a
 * session that wraps its own, as the fork hand does (`forkHand.ts`): before each wait while the
 * miner is docked, it researches the cheapest throughput node the wallet pays for, the next service
 * kept back, round after round, wherever its anchor is; the bot then buys the item at the Upgrade
 * bay as it buys any researched item. Throughput nodes are the drill-gear lane's capabilities and
 * Marks and the lane's fork, Wide first (they count as felt drill speed, VS point 3). Only specs
 * use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { BotSession } from '../../systems/bot/botSession'
import { canPay } from '../../systems/bot/botWallet'
import { cmp, type Money } from '../../systems/money'
import { forkBranchNodeOf } from './systems/forkBranches'
import { CHOOSE_FORK_COMMAND } from './systems/forkCommands'
import { chooseForkRefusalOf, forkChoiceCostOf } from './systems/forkRules'
import { nodeCost } from './systems/nodeCost'
import type { TechLane } from './systems/techNode'
import { registeredTechTree } from './systems/techTree'
import { UNLOCK_NODE_COMMAND } from './systems/techTreeCommands'
import { availableNodes } from './systems/unlockRules'

/** The lane whose nodes the rush buys: its drill gear counts as felt drill speed. */
export const RUSH_LANE: TechLane = 'drill-gear'

/** The branch the rush picks at the lane's fork: Wide, the throughput branch (#268). */
export const RUSH_FORK_BRANCH = 'wide'

/** One buy the rush could make now: the command and its price. */
interface RushBuy {
  intent: CommandIntent
  price: Money
}

/** `session`, researching the cheapest throughput node it pays for before each docked wait. */
export function withRushHand(session: BotSession): BotSession {
  return {
    ...session,
    wait(ticks) {
      if (session.vehicle().mode === 'docked') rushWhilePaid(session)
      session.wait(ticks)
    },
  }
}

/** Buys the cheapest throughput node the wallet pays for, again and again, until none pays. */
export function rushWhilePaid(session: BotSession): void {
  for (let buy = cheapestPaidBuyOf(session); buy !== null; buy = cheapestPaidBuyOf(session)) {
    if (isRefused(session.submit(buy.intent))) return
  }
}

function cheapestPaidBuyOf(session: BotSession): RushBuy | null {
  const paid = rushBuysOf(session).filter((buy) => canPay(session, buy.price))
  return paid.sort((a, b) => cmp(a.price, b.price))[0] ?? null
}

function rushBuysOf(session: BotSession): RushBuy[] {
  return [...laneNodeBuysOf(session), ...forkChoiceBuysOf(session)]
}

function laneNodeBuysOf(session: BotSession): RushBuy[] {
  return availableNodes(session.state(), session.playerId)
    .filter((node) => node.lane === RUSH_LANE)
    .map((node) => ({
      intent: { type: UNLOCK_NODE_COMMAND, payload: { nodeId: node.id } } as CommandIntent,
      price: nodeCost(node),
    }))
}

/** The lane's fork on Wide while the lane has chosen nothing and the tree would open it. */
function forkChoiceBuysOf(session: BotSession): RushBuy[] {
  const fork = forkBranchNodeOf(registeredTechTree(), RUSH_LANE, RUSH_FORK_BRANCH)
  if (fork === null) return []
  const refusal = chooseForkRefusalOf(session.state(), session.playerId, RUSH_LANE, fork.branch)
  if (refusal !== null && refusal !== 'money_short') return []
  const payload = { lane: RUSH_LANE, branch: fork.branch }
  const intent = { type: CHOOSE_FORK_COMMAND, payload } as CommandIntent
  return [{ intent, price: forkChoiceCostOf(fork) }]
}

function isRefused(events: readonly { type: string }[]): boolean {
  return events.some(
    (event) => event.type === 'tech-tree.TechNodeRefused' || event.type === 'tech-tree.ForkRefused',
  )
}
