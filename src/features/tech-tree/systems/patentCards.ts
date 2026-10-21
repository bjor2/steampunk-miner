/**
 * The Patent Office's cards (spec #678, ticket 687; design-system.md sections 10 and 11): the tech
 * tree on the shared sheet, one card per node the screen model shows, in the order the wallet
 * reaches them (`treeList`). A card is the node's name, one line and the price as its figure,
 * greyed while the wallet is short of it, whatever else the node still waits on. The line is gain text: a researched item with Marks offers its
 * next Mark and says what it changes ("Mk II: -10% cooldown", or the Mark's milestone verb); a
 * node not yet researched says what it is, and a locked one why. Never a stat table.
 */
import { gainTextOf } from '../../../systems/views/gainText'
import { cmp, fromSafeInteger, type Money } from '../../../systems/money'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import { ONE_LINE_WORDS_MAX } from '../../../constants/uiParts'
import { markStepOf, type MarkStatName } from './markLadder'
import { nextMilestoneLineOf } from './milestoneCardLine'
import { nextMilestoneOf } from './markMilestones'
import { markOfNodeId } from './markNodes'
import { romanNumeralOf, type MarkChipModel, type NodeCardModel } from './nodeCardModel'
import { markBearerOfItem, type TechTree } from './techTree'
import type { MarkLadder } from './techNode'
import { affordabilityListOf } from './treeList'
import type { TreeScreenModel } from './treeScreenModel'

export interface PatentCard {
  /** The card's text id, under the tree's `tech-tree.` budget prefix. */
  id: string
  nodeId: string
  title: string
  line: string
  iconId: string
  /** The price of what a press researches; null once nothing is left to research. */
  priceText: string | null
  /** The wallet is short of the price: the figure greys (#686 `isMuted`). */
  isMuted: boolean
  /** The node a press researches: the node itself, or its item's next Mark; null for none. */
  researchNodeId: string | null
}

const MARK_STAT_WORDS: Readonly<Record<MarkStatName, string>> = {
  cooldown: 'cooldown',
  magnitude: 'strength',
  charges: 'charges',
}

const RESEARCHED_LINE = 'Researched'

/** What a node's own line says when its flavour runs past one line. */
const UNLOCKS_LINE_PREFIX = 'Unlocks'

/** What every card of one list reads besides its node: the tree and the player's wallet. */
interface PatentContext {
  tree: TechTree
  wallet: Money
}

export function patentCardsOf(model: TreeScreenModel, tree: TechTree, wallet: Money): PatentCard[] {
  const context = { tree, wallet }
  return affordabilityListOf(model).map((card) => patentCardOf(card, context))
}

function patentCardOf(card: NodeCardModel, context: PatentContext): PatentCard {
  const chip = card.markChip
  if (card.status === 'researched' && chip !== null) return markCardOf(card, chip, context)
  if (card.status === 'researched') return researchedCardOf(card)
  return nodeResearchCardOf(card, context.wallet)
}

/**
 * A node still to research: its price, greyed when only the wallet stands in the way, and what
 * it is; a locked node says why instead.
 */
function nodeResearchCardOf(card: NodeCardModel, wallet: Money): PatentCard {
  return {
    ...cardBaseOf(card),
    line: card.status === 'locked' ? (card.refusalText ?? ownLineOf(card)) : ownLineOf(card),
    priceText: card.costText,
    isMuted: isShortOf(wallet, card.cost),
    researchNodeId: card.id,
  }
}

/** The node's flavour while it fits one line, else what it unlocks. */
function ownLineOf(card: NodeCardModel): string {
  if (wordCountOf(card.description) <= ONE_LINE_WORDS_MAX) return card.description
  return `${UNLOCKS_LINE_PREFIX} ${card.name}`
}

function researchedCardOf(card: NodeCardModel): PatentCard {
  return {
    ...cardBaseOf(card),
    line: RESEARCHED_LINE,
    priceText: null,
    isMuted: false,
    researchNodeId: null,
  }
}

/** A researched item with Marks: the next Mark and its gain, or the mastered plate. */
function markCardOf(card: NodeCardModel, chip: MarkChipModel, context: PatentContext): PatentCard {
  const next = chip.next
  if (next === null) return { ...researchedCardOf(card), line: chip.text }
  return {
    ...cardBaseOf(card),
    line: nextMarkLineOf(card, next.nodeId, context.tree),
    priceText: next.costText,
    isMuted: isShortOf(context.wallet, next.cost),
    researchNodeId: next.nodeId,
  }
}

function nextMarkLineOf(card: NodeCardModel, markNodeId: string, tree: TechTree): string {
  const ladder = markBearerOfItem(tree, card.itemId)?.ladder ?? null
  const mark = markOfNodeId(markNodeId)?.mark ?? null
  if (ladder === null || mark === null) return RESEARCHED_LINE
  return milestoneLineAt(ladder, mark) ?? markGainLineOf(ladder, mark)
}

/** The milestone the Mark brings, in its own words; null for a Mark that only steps a stat. */
function milestoneLineAt(ladder: MarkLadder, mark: number): string | null {
  const milestone = nextMilestoneOf(ladder, mark - 1)
  return milestone?.mark === mark ? nextMilestoneLineOf(ladder, mark - 1) : null
}

/** "Mk II: -10% cooldown": the stat this Mark steps and by how much. */
function markGainLineOf(ladder: MarkLadder, mark: number): string {
  const after = markStepOf(ladder, mark)
  const markText = `Mk ${romanNumeralOf(mark)}`
  if (after.stepped === null) return markText
  const before = markStepOf(ladder, mark - 1).stats[after.stepped] ?? 0
  const gain = gainTextOf(
    fromSafeInteger(before),
    fromSafeInteger(after.stats[after.stepped] ?? 0),
    MARK_STAT_WORDS[after.stepped],
  )
  return `${markText}: ${gain}`
}

function isShortOf(wallet: Money, price: Money): boolean {
  return cmp(wallet, price) < 0
}

function cardBaseOf(card: NodeCardModel): Pick<PatentCard, 'id' | 'nodeId' | 'title' | 'iconId'> {
  return {
    id: `tech-tree.patent.${card.id}`,
    nodeId: card.id,
    title: card.name,
    iconId: card.iconId,
  }
}
