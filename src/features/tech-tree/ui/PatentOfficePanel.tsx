/**
 * The Patent Office (spec #678, ticket 687; design-system.md section 11): the tech tree on the one
 * base sheet, a card per node in the order the wallet reaches them (`patentCards`): the name, one
 * line of gain text or why it waits, and the price, greyed while the wallet is short. A card's act
 * researches its node, or its item's next Mark, through `tech-tree.unlock_node`; the authority
 * refuses what cannot be researched. Markup only.
 */
import { SheetCard } from '../../../ui/kit/SheetCard'
import type { PatentCard } from '../systems/patentCards'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { nodeTestIdOf, TREE_TEST_IDS } from './nodeTestIds'
import { usePatentCards, useTreeEventRefresh } from './useTreeScreenModel'
import styles from './PatentOfficePanel.module.css'

export function PatentOfficePanel() {
  useTreeEventRefresh()
  const cards = usePatentCards()
  const researchNode = useTreeScreenStore((state) => state.researchNode)
  return <PatentOfficePanelView cards={cards} onResearch={researchNode} />
}

/** The cards as a server render draws them, from the read model alone. */
export function PatentOfficePanelView({
  cards,
  onResearch,
}: {
  cards: readonly PatentCard[]
  onResearch: (nodeId: string) => void
}) {
  return (
    <div className={styles.cards} data-testid={TREE_TEST_IDS.patentCards}>
      {cards.map((card) => (
        <SheetCard
          key={card.id}
          text={{ id: card.id, title: card.title, line: card.line }}
          iconId={card.iconId}
          figure={card.priceText}
          isMuted={card.isMuted}
          testId={nodeTestIdOf(card.nodeId)}
          onAct={() => researchCardNode(card, onResearch)}
        />
      ))}
    </div>
  )
}

/** A researched node with nothing left to research presses nothing. */
function researchCardNode(card: PatentCard, onResearch: (nodeId: string) => void): void {
  if (card.researchNodeId !== null) onResearch(card.researchNodeId)
}
