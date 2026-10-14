/**
 * The fork commands and events (GD lock on #255, ticket 259; the rules are `forkRules.ts`):
 *
 * - `tech-tree.choose_fork {lane, branch}`: the lane's first branch, paid at its node's price,
 *   answered by `ForkChosen {lane, branch, cost}` and the wallet's `MoneyChanged`.
 * - `tech-tree.rechoose_fork {lane, branch}`: switches the lane to its other branch at the
 *   platform for one Mark step, answered by `ForkRechosen {lane, from, to, cost}` and
 *   `MoneyChanged`.
 *
 * - `debug.tech-tree.forceFork {lane, branch}`: the forced-branch start of `balance:forks` (#255
 *   build 2, ticket 267): the branch made the lane's active one, free and whatever the planet, as
 *   a scenario sets a level. It logs only the kernel's `debug_command_applied`, so it never
 *   counts as play.
 *
 * A refusal changes nothing and is answered as `ForkRefused {lane, branch, reason}`, the first of
 * the rules' order, as `unlock_node` answers `TechNodeRefused`; the forced start refuses only an
 * unknown branch.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { withWallet } from '../../../systems/authority/authorityState'
import type { RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { sub, toCanonical, type Money } from '../../../systems/money'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import { forkBranchNodeOf } from './forkBranches'
import { chooseBranch } from './forkNode'
import {
  chooseForkRefusalOf,
  forkChoiceCostOf,
  forkRechoiceOf,
  rechooseForkRefusalOf,
  type ForkRefusal,
} from './forkRules'
import { forkChoicesOf, withForkChoices } from './forkSection'
import type { TechLane } from './techNode'
import { registeredTechTree, type ForkBranchNode, type TechTree } from './techTree'
import { withNodesUnlocked } from './techTreeSection'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'tech-tree.choose_fork': ForkPick
    'tech-tree.rechoose_fork': ForkPick
    'debug.tech-tree.forceFork': ForkPick
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** Canonical Money `cost`: the branch node's price. */
    'tech-tree.ForkChosen': { lane: TechLane; branch: string; cost: string }
    /** Canonical Money `cost`: one Mark step, never refunded. */
    'tech-tree.ForkRechosen': { lane: TechLane; from: string; to: string; cost: string }
    'tech-tree.ForkRefused': { lane: string; branch: string; reason: ForkRefusal }
  }
}

/** The lane and the branch a fork command names, as the player sent them. */
export interface ForkPick {
  lane: string
  branch: string
}

export const CHOOSE_FORK_COMMAND = 'tech-tree.choose_fork'
export const RECHOOSE_FORK_COMMAND = 'tech-tree.rechoose_fork'

type ForkRefusalOf = typeof chooseForkRefusalOf

export const FORK_RULES: SliceCommandRules = {
  'tech-tree.choose_fork': {
    fields: { lane: 'text', branch: 'text' },
    apply: (state, { playerId, payload }) =>
      answerForkPick(state, playerId, payload, chooseForkRefusalOf, chooseFork),
  },
  'tech-tree.rechoose_fork': {
    fields: { lane: 'text', branch: 'text' },
    apply: (state, { playerId, payload }) =>
      answerForkPick(state, playerId, payload, rechooseForkRefusalOf, rechooseFork),
  },
  'debug.tech-tree.forceFork': {
    fields: { lane: 'text', branch: 'text' },
    apply: (state, { playerId, payload }) => forceFork(state, playerId, payload),
  },
}

function answerForkPick(
  state: AuthorityState,
  playerId: string,
  pick: ForkPick,
  refusalOf: ForkRefusalOf,
  act: (
    state: AuthorityState,
    playerId: string,
    fork: ForkBranchNode,
    tree: TechTree,
  ) => RuleEffect,
): RuleEffect {
  const tree = registeredTechTree()
  const reason = refusalOf(state, playerId, pick.lane, pick.branch, tree)
  const fork = forkBranchNodeOf(tree, pick.lane, pick.branch)
  if (fork === null || reason !== null) return refuseFork(state, pick, reason ?? 'unknown_branch')
  return act(state, playerId, fork, tree)
}

function refuseFork(state: AuthorityState, pick: ForkPick, reason: ForkRefusal): RuleEffect {
  return { state, events: [{ type: 'tech-tree.ForkRefused', ...pick, reason }] }
}

/** No gate, price or platform: only a branch no pair registers is refused. */
function forceFork(state: AuthorityState, playerId: string, pick: ForkPick): RuleEffect {
  const fork = forkBranchNodeOf(registeredTechTree(), pick.lane, pick.branch)
  if (fork === null) return refuseFork(state, pick, 'unknown_branch')
  return { state: withBranchActive(state, playerId, fork, [fork.node.id]), events: [] }
}

function chooseFork(state: AuthorityState, playerId: string, fork: ForkBranchNode): RuleEffect {
  const cost = forkChoiceCostOf(fork)
  const chosen = { type: 'tech-tree.ForkChosen' as const, lane: fork.lane, branch: fork.branch }
  return {
    state: withBranchActive(paidState(state, playerId, cost), playerId, fork, [fork.node.id]),
    events: [{ ...chosen, cost: toCanonical(cost) }, moneyChangedOf(state, playerId, cost)],
  }
}

function rechooseFork(
  state: AuthorityState,
  playerId: string,
  fork: ForkBranchNode,
  tree: TechTree,
): RuleEffect {
  const { from, cost, openedNodeIds } = forkRechoiceOf(state, playerId, fork, tree)
  const switched = { lane: fork.lane, from: from.branch, to: fork.branch, cost: toCanonical(cost) }
  return {
    state: withBranchActive(paidState(state, playerId, cost), playerId, fork, openedNodeIds),
    events: [
      { type: 'tech-tree.ForkRechosen', ...switched },
      moneyChangedOf(state, playerId, cost),
    ],
  }
}

/** The branch's nodes researched and the branch active in its lane. */
function withBranchActive(
  state: AuthorityState,
  playerId: string,
  fork: ForkBranchNode,
  nodeIds: readonly string[],
): AuthorityState {
  const choices = chooseBranch(forkChoicesOf(state, playerId), fork.lane, fork.branch)
  return withForkChoices(withNodesUnlocked(state, playerId, nodeIds), playerId, choices)
}

function paidState(state: AuthorityState, playerId: string, cost: Money): AuthorityState {
  return withWallet(state, playerId, sub(state.players[playerId].wallet, cost))
}

function moneyChangedOf(state: AuthorityState, playerId: string, cost: Money): DomainEventBody {
  const wallet = state.players[playerId].wallet
  return { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, cost)) }
}
