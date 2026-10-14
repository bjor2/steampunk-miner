/**
 * Spec plumbing for the #255 build 6 guards (ticket 271): the twelve P16 fork branches of the six
 * lanes as the loaded tree prices them. A branch a lane holds back (the Hauler until #385) is not
 * in the tree, so it is placed at its registered sibling's slot, the one slot a pair shares
 * (`laneSlotsOf`); once its lane registers it, it comes from the tree like the rest. Only specs
 * use it.
 */
import { contentOf } from '../../systems/registries/content'
import { HELD_EXTRACTION_FORK_NODES } from '../extraction'
import { authoredTreeNodeOf } from './systems/authoredNodes'
import type { ForkNode } from './systems/forkNode'
import type { TechLane, TechNode, TreeNode } from './systems/techNode'
import { treeNodeOf, type TechTree } from './systems/techTree'

/** One branch to walk: its tree node, the node the lane authored, and whether it is held back. */
export interface WalkedForkBranch {
  lane: TechLane
  branch: string
  node: TreeNode
  authored: TechNode
  isHeld: boolean
}

/** Branches the lanes build but do not register yet. */
const HELD_FORK_NODES: readonly ForkNode[] = HELD_EXTRACTION_FORK_NODES

/** Every lane's two branches: the registered ones from the tree, the held ones beside them. */
export function forkBranchesToWalk(tree: TechTree): WalkedForkBranch[] {
  return [...registeredBranchesOf(tree), ...heldBranchesOf(tree)]
}

/** The walked branches by lane, each lane's pair in the order they were found. */
export function forkPairsToWalk(tree: TechTree): Map<TechLane, WalkedForkBranch[]> {
  const pairs = new Map<TechLane, WalkedForkBranch[]>()
  for (const walked of forkBranchesToWalk(tree)) {
    pairs.set(walked.lane, [...(pairs.get(walked.lane) ?? []), walked])
  }
  return pairs
}

function registeredBranchesOf(tree: TechTree): WalkedForkBranch[] {
  const authored = contentOf('tech-node')
  return tree.forkBranches.map((fork) => ({
    lane: fork.lane,
    branch: fork.branch,
    node: fork.node,
    authored: authored.find((node) => node.id === fork.node.id)!,
    isHeld: false,
  }))
}

function heldBranchesOf(tree: TechTree): WalkedForkBranch[] {
  return HELD_FORK_NODES.filter((held) => treeNodeOf(tree, held.id) === null).map((held) => ({
    lane: held.lane,
    branch: held.branch,
    node: authoredTreeNodeOf(held, siblingSlotOf(tree, held)),
    authored: held,
    isHeld: true,
  }))
}

/** The held branch's id at the depth its registered sibling sits at. */
function siblingSlotOf(tree: TechTree, held: ForkNode): ReadonlyMap<string, number> {
  const sibling = tree.forkBranches.find((fork) => fork.node.id.startsWith(`${held.pairId}.`))
  if (sibling === undefined) throw new Error(`held branch ${held.id} has no registered sibling`)
  return new Map([[held.id, sibling.node.depthTerm]])
}
