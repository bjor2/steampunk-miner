/**
 * Choosing and re-choosing a lane's P16 fork (GD lock on #255, ticket 259).
 *
 * - **Choice** (`choose_fork`): the lane's first branch, researched like any capability: the same
 *   tier, discovery, prerequisite, owned-item and lab gates, at the branch node's `nodeCost`.
 * - **Re-choice** (`rechoose_fork`): only at the platform (docked at either bay). The price is one
 *   Mark step: the active branch's next Mark, priced by `nodeCost` (`bandOrePriceAt`) on the planet
 *   the session is on, so it scales and never goes stale. Nothing is refunded and nothing is taken
 *   back: the old branch stays researched but inactive. The new branch opens with the old one's
 *   Mark, up to its own last Mark; a branch held before keeps its own higher Marks. No unlock tier
 *   or schedule row moves.
 *
 * Both branches of a pair share one tier and one lane slot, so both prices are the same whichever
 * branch is active.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { dockedBayOf } from '../../../systems/authority/dockRules'
import { cmp, type Money } from '../../../systems/money'
import { activeForkBranchNodeOf, forkBranchNodeOf } from './forkBranches'
import { activeBranchOf } from './forkNode'
import { forkChoicesOf } from './forkSection'
import { markBearerOf, markNodeIdOf, markNodeOf, type MarkBearer } from './markNodes'
import { nodeCost } from './nodeCost'
import type { MarkLadder } from './techNode'
import {
  markBearerOfItem,
  registeredTechTree,
  type ForkBranchNode,
  type TechTree,
} from './techTree'
import { unlockedNodeIdsOf } from './techTreeSection'
import {
  isUnlocked,
  itemsUnlockedBy,
  researchGateRefusalOf,
  TECH_NODE_REFUSALS,
  type TechNodeRefusal,
} from './unlockRules'

/** The fork commands' own refusals, ahead of the research gates a branch shares with any node. */
export const FORK_REFUSALS = [
  'unknown_branch',
  'already_chosen',
  'not_chosen',
  'same_branch',
  'not_at_platform',
  ...TECH_NODE_REFUSALS,
] as const

export type ForkRefusal = (typeof FORK_REFUSALS)[number]

/** What a re-choice does: the branch it leaves, its price and the nodes it opens. */
export interface ForkRechoice {
  from: ForkBranchNode
  cost: Money
  /** The new branch's capability and the Marks it carries over. */
  openedNodeIds: readonly string[]
}

/** A branch without a ladder plays as bought: its re-choice is still priced as its Mark 2. */
const LADDERLESS: MarkLadder = { isIncomeItem: false }

/** Why `choose_fork` would be refused now; null when it would make `branch` the lane's branch. */
export function chooseForkRefusalOf(
  state: AuthorityState,
  playerId: string,
  lane: string,
  branch: string,
  tree: TechTree = registeredTechTree(),
): ForkRefusal | null {
  const fork = forkBranchNodeOf(tree, lane, branch)
  if (fork === null) return 'unknown_branch'
  if (activeBranchOf(forkChoicesOf(state, playerId), fork.lane) !== null) return 'already_chosen'
  const gate = researchGateRefusalOf(state, playerId, fork.node)
  return gate ?? walletRefusalOf(state, playerId, forkChoiceCostOf(state, fork))
}

/** Why `rechoose_fork` would be refused now; null when it would switch the lane to `branch`. */
export function rechooseForkRefusalOf(
  state: AuthorityState,
  playerId: string,
  lane: string,
  branch: string,
  tree: TechTree = registeredTechTree(),
): ForkRefusal | null {
  const fork = forkBranchNodeOf(tree, lane, branch)
  if (fork === null) return 'unknown_branch'
  const active = activeBranchOf(forkChoicesOf(state, playerId), fork.lane)
  if (active === null) return 'not_chosen'
  if (active === fork.branch) return 'same_branch'
  if (dockedBayOf(state, playerId) === null) return 'not_at_platform'
  const gate = openingRefusalOf(state, playerId, fork)
  return gate ?? walletRefusalOf(state, playerId, forkRechoiceOf(state, playerId, fork, tree).cost)
}

/** The first choice's price: the branch node bought on the planet the session is on. */
export function forkChoiceCostOf(state: AuthorityState, fork: ForkBranchNode): Money {
  return nodeCost(fork.node, state.planet.index)
}

/** The re-choice to `to`, which must be the other branch of a lane that has chosen. */
export function forkRechoiceOf(
  state: AuthorityState,
  playerId: string,
  to: ForkBranchNode,
  tree: TechTree = registeredTechTree(),
): ForkRechoice {
  const from = activeForkBranchNodeOf(tree, forkChoicesOf(state, playerId), to.lane)!
  const mark = branchMarkOf(state, playerId, from, tree)
  return {
    from,
    cost: nextMarkPriceOf(state, tree, from, mark),
    openedNodeIds: [to.node.id, ...carriedMarkIdsOf(markBearerOfBranch(tree, to), mark)],
  }
}

/** The re-choice price for the lane now; null before the lane chooses. */
export function forkRechoicePriceOf(
  state: AuthorityState,
  playerId: string,
  lane: string,
  tree: TechTree = registeredTechTree(),
): Money | null {
  const active = activeForkBranchNodeOf(tree, forkChoicesOf(state, playerId), lane)
  if (active === null) return null
  return nextMarkPriceOf(state, tree, active, branchMarkOf(state, playerId, active, tree))
}

/** The researched Mark of the branch's item, active or not: 1 for the capability alone. */
export function branchMarkOf(
  state: AuthorityState,
  playerId: string,
  fork: ForkBranchNode,
  tree: TechTree,
): number {
  const itemId = fork.node.unlocks.itemId
  const items = itemsUnlockedBy(unlockedNodeIdsOf(state, playerId), tree)
  return items.find((item) => item.itemId === itemId)?.mark ?? 1
}

/** A branch held before is open already; a new one passes the gates any research does. */
function openingRefusalOf(
  state: AuthorityState,
  playerId: string,
  fork: ForkBranchNode,
): TechNodeRefusal | null {
  if (isUnlocked(state, playerId, fork.node.id)) return null
  return researchGateRefusalOf(state, playerId, fork.node)
}

function walletRefusalOf(state: AuthorityState, playerId: string, cost: Money): ForkRefusal | null {
  return cmp(state.players[playerId].wallet, cost) >= 0 ? null : 'money_short'
}

/** One Mark step: the branch's Mark after `mark`, bought on the planet the session is on. */
function nextMarkPriceOf(
  state: AuthorityState,
  tree: TechTree,
  fork: ForkBranchNode,
  mark: number,
): Money {
  return nodeCost(markNodeOf(markBearerOfBranch(tree, fork), mark + 1), state.planet.index)
}

function markBearerOfBranch(tree: TechTree, fork: ForkBranchNode): MarkBearer {
  return markBearerOfItem(tree, fork.node.unlocks.itemId) ?? markBearerOf(fork.node, LADDERLESS)
}

/** Marks 2 to `mark` of the branch's ladder, stopping at its last Mark. */
function carriedMarkIdsOf(bearer: MarkBearer, mark: number): string[] {
  const lastCarried = Math.min(mark, bearer.lastMark)
  const itemId = bearer.capability.unlocks.itemId
  return Array.from({ length: Math.max(0, lastCarried - 1) }, (_, index) =>
    markNodeIdOf(itemId, index + 2),
  )
}
