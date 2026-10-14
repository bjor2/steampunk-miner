/**
 * One node as the tree screen shows it (spec #161 section 4): where it sits, whether it can be
 * researched now, its price, what it needs, and for a Mark-bearing item the ladder chip ("Mk VII
 * -> VIII") that stands for all its Marks, which never spread into separate nodes on the map.
 *
 * No line names a planet (Content's copy on #411): a node the wallet is short for reads
 * "Price: {price}", one waiting on a prerequisite "Needs: {prereqName}". The tier only places the
 * card on the map's planet ruler.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { formatAmount } from '../../../systems/displayAmount'
import { markNodeIdOf, markNodeOf, type MarkBearer } from './markNodes'
import { nodeCost } from './nodeCost'
import { markBearerOfItem, treeNodeOf, type TechTree } from './techTree'
import type { TreeNode } from './techNode'
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
  /** Each "Note: ..." line under the flavour, in order; none for most nodes. */
  notes: readonly string[]
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
  markChip: MarkChipModel | null
}

/** What every card of one screen reads: the state, the player and the tree. */
export interface CardContext {
  state: AuthorityState
  playerId: string
  tree: TechTree
  unlocked: ReadonlySet<string>
}

type RefusalText = (node: TreeNode, context: CardContext) => string

const REFUSAL_TEXT: Readonly<Record<TechNodeRefusal, RefusalText>> = {
  unknown_node: () => 'Not on the tree',
  already_unlocked: () => 'Researched',
  fork_branch: () => 'One branch of a fork: choose it, or switch at the platform',
  held_feature: () => 'Not in the game yet',
  missing_prereq: (node, context) => `Needs: ${missingPrereqNamesOf(node, context).join(', ')}`,
  not_owned: () => 'Own the gear it works with first',
  money_short: (node) => `Price: ${formatAmount(nodeCost(node))}`,
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

export function cardContextOf(
  state: AuthorityState,
  playerId: string,
  tree: TechTree,
): CardContext {
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
    notes: noteLinesOf(node),
    itemId: node.unlocks.itemId,
    status: statusOf(answer),
    refusal,
    refusalText: refusal === null ? null : REFUSAL_TEXT[refusal](node, context),
    costText: formatAmount(nodeCost(node)),
    prereqNames: prereqNamesOf(node, context),
    prereqText: prereqNamesOf(node, context).join(', ') || 'Nothing',
    markChip: markChipOf(node, context),
  }
}

/** A note reads with its "Note" label and no comma before the colon (#351). */
function noteLinesOf(node: TreeNode): string[] {
  return (node.cardNotes ?? []).map((note) => `Note: ${note}`)
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
  return node.prereqs.map((id) => nodeNameOf(id, context))
}

function missingPrereqNamesOf(node: TreeNode, context: CardContext): string[] {
  return node.prereqs.filter((id) => !context.unlocked.has(id)).map((id) => nodeNameOf(id, context))
}

function nodeNameOf(nodeId: string, context: CardContext): string {
  return treeNodeOf(context.tree, nodeId)?.name ?? nodeId
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
    costText: formatAmount(nodeCost(node)),
  }
}
