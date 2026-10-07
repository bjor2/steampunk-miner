/**
 * Mark N of an item (spec #161 section 2, generated, never registered): `tech.mark.<itemId>.<N>`
 * for N >= 2, researchable from `markTier = unlockTier + M(N - 1)`, needing Mark N - 1 (the
 * capability itself for Mark 2). Its depth is the item's lane slot plus `min(N, markDepthCap)`,
 * so past Mark 10 its price grows only with the ore value. A ladder ends at mastery: no Mark
 * exists past it.
 */
import { lastMarkOf } from './markLadder'
import type { MarkLadder, TreeNode } from './techNode'
import { TREE_ECONOMY } from './treeEconomy'

const MARK_ID_PREFIX = 'tech.mark.'
const FIRST_MARK = 2

export interface MarkBearer {
  /** The capability that unlocked the item; its lane slot is the Marks' base depth. */
  capability: TreeNode
  ladder: MarkLadder
  lastMark: number
}

export function markBearerOf(capability: TreeNode, ladder: MarkLadder): MarkBearer {
  return { capability, ladder, lastMark: lastMarkOf(ladder) }
}

export function markNodeIdOf(itemId: string, mark: number): string {
  return `${MARK_ID_PREFIX}${itemId}.${mark}`
}

/** The item and Mark a Mark id names, or null for any other id. */
export function markOfNodeId(nodeId: string): { itemId: string; mark: number } | null {
  if (!nodeId.startsWith(MARK_ID_PREFIX)) return null
  const rest = nodeId.slice(MARK_ID_PREFIX.length)
  const split = rest.lastIndexOf('.')
  const markText = rest.slice(split + 1)
  if (split <= 0 || !/^[1-9]\d*$/.test(markText)) return null
  return { itemId: rest.slice(0, split), mark: Number.parseInt(markText, 10) }
}

export function markTierOf(bearer: MarkBearer, mark: number): number {
  return bearer.capability.unlockTier + TREE_ECONOMY.cadence.markEvery * (mark - 1)
}

/** Whether Mark `mark` of this item exists: past the capability and not past mastery. */
export function isMarkOnLadder(bearer: MarkBearer, mark: number): boolean {
  return mark >= FIRST_MARK && mark <= bearer.lastMark
}

export function markNodeOf(bearer: MarkBearer, mark: number): TreeNode {
  const { capability } = bearer
  const itemId = capability.unlocks.itemId
  return {
    id: markNodeIdOf(itemId, mark),
    kind: 'mark',
    lane: capability.lane,
    name: capability.name,
    unlockTier: markTierOf(bearer, mark),
    prereqs: [mark === FIRST_MARK ? capability.id : markNodeIdOf(itemId, mark - 1)],
    unlocks: { itemId, mark },
    iconId: capability.iconId,
    description: capability.description,
    label: 'both',
    costKind: 'mark',
    depthTerm: capability.depthTerm + Math.min(mark, TREE_ECONOMY.costs.markDepthCap),
  }
}

/** Every Mark of the item researchable by `planetIndex`, lowest first. */
export function markNodesThrough(bearer: MarkBearer, planetIndex: number): TreeNode[] {
  const marks: TreeNode[] = []
  for (let mark = FIRST_MARK; isMarkOnLadder(bearer, mark); mark += 1) {
    if (markTierOf(bearer, mark) > planetIndex) break
    marks.push(markNodeOf(bearer, mark))
  }
  return marks
}
