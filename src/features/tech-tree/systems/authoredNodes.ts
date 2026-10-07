/**
 * The authored nodes as the tree reads them (spec #161 section 3, Definitions): a capability's
 * depth is its lane slot, 0 to n - 1 in `unlockTier` order (ties by id, the registry's order);
 * a combo's depth is one past its deeper parent's slot.
 */
import type { TechNode, TreeNode } from './techNode'

/** Each capability's slot in its lane. */
export function laneSlotsOf(nodes: readonly TechNode[]): ReadonlyMap<string, number> {
  const slots = new Map<string, number>()
  capabilityLanesOf(nodes).forEach((lane) => lane.forEach((node, slot) => slots.set(node.id, slot)))
  return slots
}

/** A combo is one past the deeper of its parents' lane slots. */
export function comboDepthOf(parents: readonly string[], slots: ReadonlyMap<string, number>) {
  return Math.max(0, ...parents.map((parent) => slots.get(parent) ?? 0)) + 1
}

export function authoredTreeNodeOf(node: TechNode, slots: ReadonlyMap<string, number>): TreeNode {
  const isCombo = node.lane === 'combo'
  return {
    id: node.id,
    kind: isCombo ? 'combo' : 'capability',
    lane: node.lane,
    name: node.name,
    unlockTier: node.unlockTier,
    prereqs: node.prereqs,
    ...(node.requiresDiscovery !== undefined && { requiresDiscovery: node.requiresDiscovery }),
    ...(node.requiresOwned !== undefined && { requiresOwned: node.requiresOwned }),
    unlocks: { itemId: node.unlocks, mark: 1 },
    iconId: node.iconId,
    description: node.description,
    label: node.label,
    costKind: node.costKind,
    depthTerm: isCombo ? comboDepthOf(node.prereqs, slots) : (slots.get(node.id) ?? 0),
  }
}

/** Earliest first, then by id. */
export function compareByTier(a: TreeNode, b: TreeNode): number {
  if (a.unlockTier !== b.unlockTier) return a.unlockTier - b.unlockTier
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function capabilityLanesOf(nodes: readonly TechNode[]): TechNode[][] {
  const lanes = new Map<string, TechNode[]>()
  nodes
    .filter((node) => node.lane !== 'combo')
    .forEach((node) => lanes.set(node.lane, [...(lanes.get(node.lane) ?? []), node]))
  return [...lanes.values()].map((lane) => [...lane].sort(compareAuthoredByTier))
}

function compareAuthoredByTier(a: TechNode, b: TechNode): number {
  if (a.unlockTier !== b.unlockTier) return a.unlockTier - b.unlockTier
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
