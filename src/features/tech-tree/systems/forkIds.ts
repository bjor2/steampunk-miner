/**
 * The ids of a lane's P16 fork (GD lock on #255): the pair is `tech.<lane>.fork` and each branch
 * `tech.<lane>.fork.<branch>`, the lane in snake case like the other node ids
 * (`tech.drill_gear.fork.wide`). A node is a fork branch by its id and lane alone, so the slots,
 * the rules and the save read one shape without a field of their own.
 */
import { TECH_LANES, type TechLane, type TechNodeLane } from './techNode'

/** Which branch of which lane a fork node is. */
export interface ForkBranchRef {
  lane: TechLane
  branch: string
}

export function forkPairIdOf(lane: TechLane): string {
  return `tech.${lane.replace('-', '_')}.fork`
}

export function forkNodeIdOf(lane: TechLane, branch: string): string {
  return `${forkPairIdOf(lane)}.${branch}`
}

export function isTechLane(lane: string): lane is TechLane {
  return (TECH_LANES as readonly string[]).includes(lane)
}

/** The branch a node is, read off its id in its own lane; null for any node that is no branch. */
export function forkBranchOfNode(node: { id: string; lane: TechNodeLane }): ForkBranchRef | null {
  if (!isTechLane(node.lane)) return null
  const prefix = `${forkPairIdOf(node.lane)}.`
  const branch = node.id.startsWith(prefix) ? node.id.slice(prefix.length) : ''
  return isBranchName(branch) ? { lane: node.lane, branch } : null
}

function isBranchName(branch: string): boolean {
  return branch.length > 0 && !branch.includes('.')
}
