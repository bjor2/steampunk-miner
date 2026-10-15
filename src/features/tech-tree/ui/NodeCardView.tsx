/**
 * The node card (#161 section 4, zoom 3) on the shared Title+OneLine element (spec #422, pass
 * #426): the name, its card line, the price and any stacking note on the element, why it is locked
 * or the Research button, and for an item with Marks the ladder chip and the next Mark's button.
 * What it builds on, unlocks and its progression label sit in the brass tooltip (`nodeElement`).
 * No line names a planet: the price is the only gate (Content's copy on #411). Stat lines arrive
 * with each item's `statPreview` from its lane slice (#159).
 */
import { Button } from '../../../ui/kit/Button'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import type { MarkChipModel, NodeCardModel } from '../systems/nodeCardModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { nodeCardElementOf } from './nodeElement'
import { NodeIcon } from './NodeIcon'
import styles from './NodeCardView.module.css'

const EMPTY_TEXT = {
  id: 'tech-tree.card.none',
  title: 'No node picked',
  oneLine: 'Pick a node on the map.',
  tooltipLines: [],
}

export function NodeCardView({ card }: { card: NodeCardModel | null }) {
  if (card === null) return <TitleOneLine text={EMPTY_TEXT} level="h3" />
  const element = nodeCardElementOf(card)
  return (
    <article className={styles.card} data-testid="tech-tree-card" data-node-id={card.id}>
      <NodeIcon card={card} size="banner" />
      <TitleOneLine
        text={element.text}
        facts={element.facts}
        lockReason={element.lockReason}
        level="h3"
      >
        <ResearchAction card={card} />
        {card.markChip !== null && <MarkLadder chip={card.markChip} />}
      </TitleOneLine>
    </article>
  )
}

/** Research while it can be; a refused node's reason is the element's lock line instead. */
function ResearchAction({ card }: { card: NodeCardModel }) {
  const researchNode = useTreeScreenStore((state) => state.researchNode)
  if (card.status === 'researched') return <p className={styles.done}>Researched</p>
  if (card.status !== 'affordable') return null
  return <Button label={`Research for ${card.costText}`} onPress={() => researchNode(card.id)} />
}

function MarkLadder({ chip }: { chip: MarkChipModel }) {
  const researchNode = useTreeScreenStore((state) => state.researchNode)
  const next = chip.researchableNext
  return (
    <div
      className={styles.ladder}
      data-testid="tech-tree-mark-chip"
      data-mastered={chip.isMastered}
    >
      <span className={styles.chip}>{chip.text}</span>
      {next !== null && (
        <Button
          label={`Next Mark for ${next.costText}`}
          onPress={() => researchNode(next.nodeId)}
        />
      )}
    </div>
  )
}
