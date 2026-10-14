/**
 * The fork commands as the pacing bot's purchases (GD lock on #255, ticket 259), so its spend
 * records file them where the #212 spend guard reads them:
 *
 * - a first choice is research, so it counts in the tree's numerator (`treeSpendGuard.ts`);
 * - a re-choice is a service cost, like a restock: in the denominator, never the numerator.
 *
 * The first choice offers each lane's branch marked `isPacingBotPick` (GD ruling on #392: the bot
 * buys gear when it is affordable on its income curve), so the on-curve bot chooses Deep once the
 * authority would open the fork and the wallet pays; a lane with no marked branch stays unchosen.
 * The bot never switches: a re-choice offers nothing. `balance:forks` (#255 build 2, ticket 267)
 * forces its branch at the run's start with `debug.tech-tree.forceFork`, since its runs end at
 * planet 10, before the forks' price anchor (P16).
 */
import { ZERO_MONEY, type Money } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import { forkBranchNodeOf } from './forkBranches'
import { CHOOSE_FORK_COMMAND, RECHOOSE_FORK_COMMAND, type ForkPick } from './forkCommands'
import { forkNodeIdOf, isTechLane } from './forkIds'
import { isForkNode } from './forkNode'
import {
  chooseForkRefusalOf,
  forkChoiceCostOf,
  forkRechoicePriceOf,
  rechooseForkRefusalOf,
} from './forkRules'
import type { TechNode } from './techNode'
import { registeredCatalogue, registeredTechTree } from './techTree'

const NO_PICKS: readonly ForkPick[] = []

export const FORK_CHOICE_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.choose-fork',
  command: CHOOSE_FORK_COMMAND,
  payloadsToTry: () => pacingBotPicksOf(registeredCatalogue().nodes),
  estimateCost: (_state, _playerId, args) => choiceCostOf(args as ForkPick),
  isAvailable: (state, playerId, args) => {
    const { lane, branch } = args as ForkPick
    return chooseForkRefusalOf(state, playerId, lane, branch) === null
  },
  boughtIdOf: (args) => branchNodeIdOf(args as ForkPick),
}

export const FORK_RECHOICE_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.rechoose-fork',
  command: RECHOOSE_FORK_COMMAND,
  payloadsToTry: () => NO_PICKS,
  estimateCost: (state, playerId, args) =>
    forkRechoicePriceOf(state, playerId, (args as ForkPick).lane) ?? ZERO_MONEY,
  isAvailable: (state, playerId, args) => {
    const { lane, branch } = args as ForkPick
    return rechooseForkRefusalOf(state, playerId, lane, branch) === null
  },
  boughtIdOf: (args) => branchNodeIdOf(args as ForkPick),
}

/** Each lane's branch marked as the pacing bot's pick, in the catalogue's order. */
export function pacingBotPicksOf(nodes: readonly TechNode[]): ForkPick[] {
  return nodes
    .filter(isForkNode)
    .filter((fork) => fork.isPacingBotPick === true)
    .map(({ lane, branch }) => ({ lane, branch }))
}

function choiceCostOf({ lane, branch }: ForkPick): Money {
  const fork = forkBranchNodeOf(registeredTechTree(), lane, branch)
  return fork === null ? ZERO_MONEY : forkChoiceCostOf(fork)
}

/** The branch node the pick names: what the spend record says was bought. */
function branchNodeIdOf({ lane, branch }: ForkPick): string {
  return isTechLane(lane) ? forkNodeIdOf(lane, branch) : `${lane}.${branch}`
}
