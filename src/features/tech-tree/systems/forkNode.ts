/**
 * A lane's P16 fork (GD lock on #255, data shape split as ticket 359): two exclusive branch nodes
 * `tech.<lane>.fork.<branch>`, capabilities on tier 16, one pair per lane. The pair is built here so
 * both branches share one `unlockTier` and, once in the tree, one `depthTerm`: `bandOrePriceAt`
 * then prices them alike on every planet, and their Mark ladders step for step. Only one branch of
 * a lane is active at a time: `tech-tree.choose_fork` picks it and `rechoose_fork` swaps it (#259).
 * The lane slices register their pairs' branches as `tech-node` content with their own items.
 */
import { authoredTreeNodeOf } from './authoredNodes'
import { forkBranchOfNode, forkNodeIdOf, forkPairIdOf } from './forkIds'
import type { TechLane, TechNode, TreeNode } from './techNode'

/** The schedule gap every lane forks at (#255 lock: "the fork goes at P16"). */
export const FORK_TIER = 16

/** One branch of a lane's fork, as a lane slice will register it. */
export interface ForkNode extends TechNode {
  lane: TechLane
  costKind: 'capability'
  unlockTier: typeof FORK_TIER
  /** The pair both branches belong to: `tech.<lane>.fork`. */
  pairId: string
  /** The branch's own name in the id, such as `wide` or `deep`. */
  branch: string
}

/** What a lane authors for one branch; the pair fills in the id, lane, tier and cost kind. */
export type ForkBranchSpec = Omit<TechNode, 'id' | 'lane' | 'unlockTier' | 'costKind'> & {
  branch: string
}

export interface ForkPair {
  id: string
  lane: TechLane
  branches: readonly [ForkNode, ForkNode]
}

/** The active branch of each lane that has chosen one; a lane absent from it has not chosen. */
export type ForkChoices = Readonly<Partial<Record<TechLane, string>>>

export const NO_FORK_CHOICES: ForkChoices = {}

/** The lane's fork pair; a branch named twice, or named with a dot, is refused. */
export function forkPairOf(
  lane: TechLane,
  specs: readonly [ForkBranchSpec, ForkBranchSpec],
): ForkPair {
  refuseUnreadablePair(lane, specs)
  const [first, second] = specs
  return {
    id: forkPairIdOf(lane),
    lane,
    branches: [forkNodeOf(lane, first), forkNodeOf(lane, second)],
  }
}

/** Both branches as the tree reads them, at the one depth the pair occupies in its lane. */
export function forkTreeNodesOf(pair: ForkPair, depthTerm: number): readonly [TreeNode, TreeNode] {
  const slots = new Map(pair.branches.map((node) => [node.id, depthTerm]))
  const [first, second] = pair.branches
  return [authoredTreeNodeOf(first, slots), authoredTreeNodeOf(second, slots)]
}

/** The branch the lane has active, or null before it chooses. */
export function activeBranchOf(choices: ForkChoices, lane: TechLane): string | null {
  return choices[lane] ?? null
}

/** The choices with `branch` active in `lane`; the lane's other branch is no longer active. */
export function chooseBranch(choices: ForkChoices, lane: TechLane, branch: string): ForkChoices {
  return { ...choices, [lane]: branch }
}

function forkNodeOf(lane: TechLane, spec: ForkBranchSpec): ForkNode {
  return {
    ...spec,
    id: forkNodeIdOf(lane, spec.branch),
    lane,
    unlockTier: FORK_TIER,
    costKind: 'capability',
    pairId: forkPairIdOf(lane),
  }
}

function refuseUnreadablePair(
  lane: TechLane,
  [first, second]: readonly [ForkBranchSpec, ForkBranchSpec],
): void {
  if (first.branch === second.branch) {
    throw new Error(`fork ${forkPairIdOf(lane)} names branch ${first.branch} twice`)
  }
  refuseUnreadableBranch(lane, first)
  refuseUnreadableBranch(lane, second)
}

/** A branch whose id does not read back as a branch (a dot in its name) would never be chosen. */
function refuseUnreadableBranch(lane: TechLane, spec: ForkBranchSpec): void {
  if (forkBranchOfNode({ id: forkNodeIdOf(lane, spec.branch), lane }) === null) {
    throw new Error(`fork ${forkPairIdOf(lane)} branch "${spec.branch}" is not one word`)
  }
}
