/**
 * One node as the tree screen shows it (spec #161 section 4): where it sits, whether it can be
 * researched now, its price on this planet, what it needs, the discovery hint, and for a
 * Mark-bearing item the ladder chip ("Mk VII -> VIII") that stands for all its Marks, which
 * never spread into separate nodes on the map.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import { formatAmount } from '../../../systems/displayAmount'
import { markNodeIdOf, markNodeOf, type MarkBearer } from './markNodes'
import { nodeCost } from './nodeCost'
import { markBearerOfItem, treeNodeOf, type TechTree } from './techTree'
import type { DiscoveryRequirement, TreeNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { unlockRefusalOf, type TechNodeRefusal } from './unlockRules'

/** `affordable`: researchable now; `available`: only the wallet is short. */
export type NodeStatus = 'researched' | 'affordable' | 'available' | 'locked'

export interface MarkChipModel {
  /** The highest Mark researched: 1 once the item's capability is, 0 before. */
  mark: number
  /** "Mk VII -> VIII", or "Mk XVIII, mastered". */
  text: string
  isMastered: boolean
  /** The next Mark to research, with its status and price; null when mastered or unowned. */
  next: NextMarkModel | null
  /** The next Mark when it can be researched now; null otherwise. */
  researchableNext: NextMarkModel | null
}

export interface NextMarkModel {
  nodeId: string
  status: NodeStatus
  costText: string
}

export interface NodeCardModel {
  id: string
  name: string
  iconId: string
  lane: TreeNode['lane']
  tier: number
  kind: TreeNode['kind']
  label: TreeNode['label']
  description: string
  itemId: string
  status: NodeStatus
  /** Why it cannot be researched now; null when it can or already is. */
  refusal: TechNodeRefusal | null
  /** The refusal in the player's words; null with no refusal. */
  refusalText: string | null
  costText: string
  prereqNames: readonly string[]
  /** The prerequisites as one line: "Nothing" for none. */
  prereqText: string
  /** How to research it early, such as "Find resonance ore to research it a planet early." */
  discoveryHint: string | null
  markChip: MarkChipModel | null
}

/** What every card of one screen reads: the state, the player and the tree. */
export interface CardContext {
  state: AuthorityState
  playerId: string
  tree: TechTree
  unlocked: ReadonlySet<string>
}

const REFUSAL_TEXT: Readonly<Record<TechNodeRefusal, (node: TreeNode) => string>> = {
  unknown_node: () => 'Not on the tree',
  already_unlocked: () => 'Researched',
  locked_tier: (node) => `Opens on planet ${node.unlockTier}`,
  undiscovered: () => 'Waits on a discovery, or one more planet',
  missing_prereq: () => 'Research what it builds on first',
  not_owned: () => 'Own the gear it works with first',
  no_lab: () => 'Needs the research lab',
  money_short: () => 'Not enough money yet',
}

const ROMAN_NUMERALS: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

export function cardContextOf(state: AuthorityState, playerId: string, tree: TechTree) {
  return { state, playerId, tree, unlocked: new Set(unlockedNodeIdsOf(state, playerId)) }
}

export function nodeCardOf(node: TreeNode, context: CardContext): NodeCardModel {
  const answer = refusalOf(node, context)
  const refusal = shownRefusalOf(answer)
  return {
    id: node.id,
    name: node.name,
    iconId: node.iconId,
    lane: node.lane,
    tier: node.unlockTier,
    kind: node.kind,
    label: node.label,
    description: node.description,
    itemId: node.unlocks.itemId,
    status: statusOf(answer),
    refusal,
    refusalText: refusal === null ? null : REFUSAL_TEXT[refusal](node),
    costText: formatAmount(nodeCost(node, context.state.planet.index)),
    prereqNames: prereqNamesOf(node, context),
    prereqText: prereqNamesOf(node, context).join(', ') || 'Nothing',
    discoveryHint: discoveryHintOf(node, context),
    markChip: markChipOf(node, context),
  }
}

/** Mark 7 as "VII". */
export function romanNumeralOf(value: number): string {
  let rest = value
  return ROMAN_NUMERALS.reduce((text, [step, numeral]) => {
    const times = Math.floor(rest / step)
    rest -= times * step
    return text + numeral.repeat(times)
  }, '')
}

function prereqNamesOf(node: TreeNode, context: CardContext): string[] {
  return node.prereqs.map((id) => treeNodeOf(context.tree, id)?.name ?? id)
}

function refusalOf(node: TreeNode, context: CardContext): TechNodeRefusal | null {
  return unlockRefusalOf(context.state, context.playerId, node.id, context.tree)
}

/** A researched node has nothing to explain. */
function shownRefusalOf(refusal: TechNodeRefusal | null): TechNodeRefusal | null {
  return refusal === 'already_unlocked' ? null : refusal
}

function statusOf(refusal: TechNodeRefusal | null): NodeStatus {
  if (refusal === null) return 'affordable'
  if (refusal === 'already_unlocked') return 'researched'
  return refusal === 'money_short' ? 'available' : 'locked'
}

function discoveryHintOf(node: TreeNode, context: CardContext): string | null {
  if (node.requiresDiscovery === undefined || context.unlocked.has(node.id)) return null
  return `Find ${requirementText(node.requiresDiscovery)} to research it a planet early.`
}

function requirementText(requirement: DiscoveryRequirement): string {
  const keys = typeof requirement === 'string' ? [requirement] : requirement.anyOf
  return keys.map(discoveryKeyText).join(' or ')
}

function discoveryKeyText(key: DiscoveryKey): string {
  const [kind, id] = key.split(':') as [string, string]
  const words = id.replaceAll('_', ' ')
  if (kind === 'ore') return `${words} ore`
  if (kind === 'enemy') return `a ${words}`
  return `${words} ground`
}

function markChipOf(node: TreeNode, context: CardContext): MarkChipModel | null {
  const bearer =
    node.kind === 'capability' ? markBearerOfItem(context.tree, node.unlocks.itemId) : null
  if (bearer === null || bearer.capability.id !== node.id) return null
  const mark = highestMarkOf(bearer, context.unlocked)
  const isMastered = mark === bearer.lastMark
  const next = mark === 0 || isMastered ? null : nextMarkOf(bearer, mark + 1, context)
  return {
    mark,
    text: isMastered ? `Mk ${romanNumeralOf(mark)}, mastered` : markStepText(mark),
    isMastered,
    next,
    researchableNext: next?.status === 'affordable' ? next : null,
  }
}

function markStepText(mark: number): string {
  if (mark === 0) return 'Mk I when researched'
  return `Mk ${romanNumeralOf(mark)} → ${romanNumeralOf(mark + 1)}`
}

function highestMarkOf(bearer: MarkBearer, unlocked: ReadonlySet<string>): number {
  if (!unlocked.has(bearer.capability.id)) return 0
  let mark = 1
  while (unlocked.has(markNodeIdOf(bearer.capability.unlocks.itemId, mark + 1))) mark += 1
  return mark
}

function nextMarkOf(bearer: MarkBearer, mark: number, context: CardContext): NextMarkModel {
  const node = markNodeOf(bearer, mark)
  return {
    nodeId: node.id,
    status: statusOf(refusalOf(node, context)),
    costText: formatAmount(nodeCost(node, context.state.planet.index)),
  }
}
