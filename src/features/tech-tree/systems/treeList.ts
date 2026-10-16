/**
 * The tree as one list (spec #470 section "Tech tree", PT-5): every node the screen shows, ordered
 * by what the wallet reaches first. Researchable now comes first, then the nodes only the wallet
 * is short for, then the locked ones, then what is already researched; inside each, the cheapest
 * first, then the earlier planet, then the id, so the order never depends on the lanes' order.
 * "Next affordable" walks the researchable ones in that order. Nothing here reads the store.
 */
import { cmp } from '../../../systems/money'
import type { NodeCardModel, NodeStatus } from './nodeCardModel'
import type { TreeScreenModel } from './treeScreenModel'

const STATUS_RANK: Readonly<Record<NodeStatus, number>> = {
  affordable: 0,
  available: 1,
  locked: 2,
  researched: 3,
}

/** Every node the search and filters keep, in the order the wallet reaches them. */
export function affordabilityListOf(model: TreeScreenModel): NodeCardModel[] {
  return model.lanes.flatMap((lane) => lane.nodes).sort(byAffordability)
}

/**
 * The researchable node after `currentId` in the list, round to the first again; the first when
 * `currentId` is none of them; null when the wallet reaches none.
 */
export function nextAffordableNodeIdOf(
  list: readonly NodeCardModel[],
  currentId: string | null,
): string | null {
  const affordable = list.filter((card) => card.status === 'affordable')
  if (affordable.length === 0) return null
  const at = affordable.findIndex((card) => card.id === currentId)
  return affordable[(at + 1) % affordable.length].id
}

function byAffordability(a: NodeCardModel, b: NodeCardModel): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    cmp(a.cost, b.cost) ||
    a.tier - b.tier ||
    a.id.localeCompare(b.id)
  )
}
