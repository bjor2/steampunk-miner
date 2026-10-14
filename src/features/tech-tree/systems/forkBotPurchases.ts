/**
 * The fork commands as the pacing bot's purchases (GD lock on #255, ticket 259), so its spend
 * records file them where the #212 spend guard reads them:
 *
 * - a first choice is research, so it counts in the tree's numerator (`treeSpendGuard.ts`);
 * - a re-choice is a service cost, like a restock: in the denominator, never the numerator.
 *
 * The bot picks no branch and never switches yet: its forced-branch mode is build 2 of #255
 * (`balance:forks`), which fills `payloadsToTry`. Until then both purchases offer nothing.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ZERO_MONEY, type Money } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import { forkBranchNodeOf } from './forkBranches'
import { CHOOSE_FORK_COMMAND, RECHOOSE_FORK_COMMAND, type ForkPick } from './forkCommands'
import { forkNodeIdOf, isTechLane } from './forkIds'
import {
  chooseForkRefusalOf,
  forkChoiceCostOf,
  forkRechoicePriceOf,
  rechooseForkRefusalOf,
} from './forkRules'
import { registeredTechTree } from './techTree'

const NO_PICKS: readonly ForkPick[] = []

export const FORK_CHOICE_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.choose-fork',
  command: CHOOSE_FORK_COMMAND,
  payloadsToTry: () => NO_PICKS,
  estimateCost: (state, _playerId, args) => choiceCostOf(state, args as ForkPick),
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

function choiceCostOf(state: AuthorityState, { lane, branch }: ForkPick): Money {
  const fork = forkBranchNodeOf(registeredTechTree(), lane, branch)
  return fork === null ? ZERO_MONEY : forkChoiceCostOf(state, fork)
}

/** The branch node the pick names: what the spend record says was bought. */
function branchNodeIdOf({ lane, branch }: ForkPick): string {
  return isTechLane(lane) ? forkNodeIdOf(lane, branch) : `${lane}.${branch}`
}
