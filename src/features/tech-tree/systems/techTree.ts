/**
 * The whole tree, authored and generated (spec #161 sections 1, 2 and 5): what the lane slices
 * registered, plus every Mark and endless combo computed from it. The tree is a pure value of
 * the registered content, rebuilt only when that content changes, so the authority, the bot and
 * the screen all read one tree.
 */
import { contentOf } from '../../../systems/registries/content'
import { authoredTreeNodeOf, compareByTier, laneSlotsOf } from './authoredNodes'
import {
  generatedComboAt,
  generatedComboPlanetsThrough,
  pairIndexOf,
  planetOfGeneratedComboId,
  type ComboGrading,
} from './generatedCombos'
import {
  isMarkOnLadder,
  markBearerOf,
  markNodeOf,
  markNodesThrough,
  markOfNodeId,
  type MarkBearer,
} from './markNodes'
import type { TechComboTemplate, TechNode, TreeNode } from './techNode'

/** The content the tree is built from. */
export interface TreeCatalogue {
  nodes: readonly TechNode[]
  templates: readonly TechComboTemplate[]
}

export interface TechTree {
  /** Capabilities and authored combos, earliest first. */
  authored: readonly TreeNode[]
  /** Every Mark-bearing item, by the id of its capability. */
  markBearers: readonly MarkBearer[]
  grading: ComboGrading
}

let built: { catalogue: TreeCatalogue; tree: TechTree } | null = null

/** The tree of the registered content (read after `loadFeatures()`, never at import). */
export function registeredTechTree(): TechTree {
  return techTreeOfCatalogue(registeredCatalogue())
}

export function registeredCatalogue(): TreeCatalogue {
  return { nodes: contentOf('tech-node'), templates: contentOf('tech-combo-template') }
}

/** Rebuilt only when the content changes; entries are compared by identity, as the registry keeps them. */
export function techTreeOfCatalogue(catalogue: TreeCatalogue): TechTree {
  if (built === null || !isSameCatalogue(built.catalogue, catalogue)) {
    built = { catalogue, tree: buildTechTree(catalogue) }
  }
  return built.tree
}

/** The node with this id, authored or generated; null for an id no node has. */
export function treeNodeOf(tree: TechTree, nodeId: string): TreeNode | null {
  return (
    tree.authored.find((node) => node.id === nodeId) ??
    markNodeOfId(tree, nodeId) ??
    generatedComboOfId(tree, nodeId)
  )
}

/** Every node researchable by `planetIndex` (its tier reached), earliest first. */
export function treeNodesThrough(tree: TechTree, planetIndex: number): TreeNode[] {
  return [
    ...tree.authored.filter((node) => node.unlockTier <= planetIndex),
    ...tree.markBearers.flatMap((bearer) => markNodesThrough(bearer, planetIndex)),
    ...generatedCombosThrough(tree, planetIndex),
  ].sort(compareByTier)
}

/**
 * The planet "unlock all" grants through: the deepest authored node, or the planet the session is
 * on when that is further, so every Mark and endless combo reached so far comes with it.
 */
export function unlockAllPlanetOf(tree: TechTree, planetIndex: number): number {
  return Math.max(planetIndex, ...tree.authored.map((node) => node.unlockTier))
}

/**
 * The planet the item unlocks on: the tier of the earliest authored node that unlocks it, the
 * planet a one-off's price is fixed at (#162 4.1); null when no node unlocks it.
 */
export function itemUnlockTierOf(tree: TechTree, itemId: string): number | null {
  const tiers = tree.authored
    .filter((node) => node.unlocks.itemId === itemId)
    .map((node) => node.unlockTier)
  return tiers.length === 0 ? null : Math.min(...tiers)
}

/** The Mark-bearing item a capability unlocked, by item id. */
export function markBearerOfItem(tree: TechTree, itemId: string): MarkBearer | null {
  return tree.markBearers.find((bearer) => bearer.capability.unlocks.itemId === itemId) ?? null
}

function buildTechTree(catalogue: TreeCatalogue): TechTree {
  const slots = laneSlotsOf(catalogue.nodes)
  const authored = catalogue.nodes.map((node) => authoredTreeNodeOf(node, slots))
  return {
    authored: [...authored].sort(compareByTier),
    markBearers: markBearersOf(catalogue.nodes, authored),
    grading: comboGradingOf(catalogue.templates, authored, slots),
  }
}

function markBearersOf(nodes: readonly TechNode[], authored: readonly TreeNode[]): MarkBearer[] {
  return nodes.flatMap((node, index) =>
    node.marks === undefined || node.lane === 'combo'
      ? []
      : [markBearerOf(authored[index], node.marks)],
  )
}

function comboGradingOf(
  templates: readonly TechComboTemplate[],
  authored: readonly TreeNode[],
  slots: ReadonlyMap<string, number>,
): ComboGrading {
  return {
    templateOfPair: (pairIndex) =>
      templates.find((template) => pairIndexOf(template.lanes) === pairIndex) ?? null,
    authoredComboOf: (itemId) =>
      authored.find((node) => node.kind === 'combo' && node.unlocks.itemId === itemId) ?? null,
    slots,
  }
}

function markNodeOfId(tree: TechTree, nodeId: string): TreeNode | null {
  const named = markOfNodeId(nodeId)
  const bearer = named === null ? null : markBearerOfItem(tree, named.itemId)
  if (named === null || bearer === null || !isMarkOnLadder(bearer, named.mark)) return null
  return markNodeOf(bearer, named.mark)
}

function generatedComboOfId(tree: TechTree, nodeId: string): TreeNode | null {
  const planetIndex = planetOfGeneratedComboId(nodeId)
  return planetIndex === null ? null : generatedComboAt(planetIndex, tree.grading)
}

function generatedCombosThrough(tree: TechTree, planetIndex: number): TreeNode[] {
  return generatedComboPlanetsThrough(planetIndex).flatMap(
    (planet) => generatedComboAt(planet, tree.grading) ?? [],
  )
}

function isSameCatalogue(a: TreeCatalogue, b: TreeCatalogue): boolean {
  return isSameEntries(a.nodes, b.nodes) && isSameEntries(a.templates, b.templates)
}

function isSameEntries<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index])
}
