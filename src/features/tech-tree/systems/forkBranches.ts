/**
 * What a lane's P16 fork means for the rest of the tree (GD lock on #255, ticket 259): one branch
 * is active at a time. A branch is opened by the fork commands, never by `unlock_node`; only the
 * active branch takes Marks; and an inactive branch's item is not unlocked, so the store does not
 * sell it and it plays at no Mark. A lane that has not chosen has no active branch.
 */
import { activeBranchOf, type ForkChoices } from './forkNode'
import { isTechLane } from './forkIds'
import type { ItemUnlock, TreeNode } from './techNode'
import type { ForkBranchNode, TechTree } from './techTree'

/** The registered branch `branch` of `lane`'s fork; null for a lane or branch no pair has. */
export function forkBranchNodeOf(
  tree: TechTree,
  lane: string,
  branch: string,
): ForkBranchNode | null {
  if (!isTechLane(lane)) return null
  return tree.forkBranches.find((fork) => fork.lane === lane && fork.branch === branch) ?? null
}

/** The lane's active branch as the tree holds it; null before the lane chooses. */
export function activeForkBranchNodeOf(
  tree: TechTree,
  choices: ForkChoices,
  lane: string,
): ForkBranchNode | null {
  if (!isTechLane(lane)) return null
  const branch = activeBranchOf(choices, lane)
  return branch === null ? null : forkBranchNodeOf(tree, lane, branch)
}

/** Whether `unlock_node` leaves the node to the fork commands: a branch, or an inactive one's Mark. */
export function isLeftToForkChoice(tree: TechTree, choices: ForkChoices, node: TreeNode): boolean {
  if (tree.forkBranches.some((fork) => fork.node.id === node.id)) return true
  return node.kind === 'mark' && inactiveBranchItemIdsOf(tree, choices).has(node.unlocks.itemId)
}

/** The unlocked items without the inactive branches' ones. */
export function activeItemsOf(
  items: readonly ItemUnlock[],
  tree: TechTree,
  choices: ForkChoices,
): ItemUnlock[] {
  const inactive = inactiveBranchItemIdsOf(tree, choices)
  return items.filter((item) => !inactive.has(item.itemId))
}

/** The items of every branch its lane does not have active. */
function inactiveBranchItemIdsOf(tree: TechTree, choices: ForkChoices): ReadonlySet<string> {
  const inactive = tree.forkBranches.filter(
    (fork) => activeBranchOf(choices, fork.lane) !== fork.branch,
  )
  return new Set(inactive.map((fork) => fork.node.unlocks.itemId))
}
