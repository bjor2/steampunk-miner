/**
 * The node card (#161 section 4, zoom 3): the flavour line, the store item it unlocks, its price
 * on this planet, what it builds on, how to research it early, and the Research button; for an
 * item with Marks, the ladder chip and the next Mark's button. Stat lines arrive with each item's
 * `statPreview` from its lane slice (#159).
 */
import { Button } from '../../../ui/kit/Button'
import type { MarkChipModel, NodeCardModel } from '../systems/nodeCardModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { NodeIcon } from './NodeIcon'
import styles from './NodeCardView.module.css'

export function NodeCardView({ card }: { card: NodeCardModel | null }) {
  if (card === null) return <p className={styles.empty}>Pick a node on the map.</p>
  return (
    <article className={styles.card} data-testid="tech-tree-card" data-node-id={card.id}>
      <header className={styles.header}>
        <NodeIcon card={card} size="banner" />
        <h3 className={styles.name}>{card.name}</h3>
        <span className={styles.label}>{card.label}</span>
      </header>
      <p className={styles.flavour}>{card.description}</p>
      <dl className={styles.facts}>
        <dt>Unlocks</dt>
        <dd>{card.itemId}</dd>
        <dt>Planet</dt>
        <dd>P{card.tier}</dd>
        <dt>Price here</dt>
        <dd data-status={card.status}>{card.costText}</dd>
        <dt>Builds on</dt>
        <dd>{card.prereqText}</dd>
      </dl>
      {card.discoveryHint !== null && <p className={styles.hint}>{card.discoveryHint}</p>}
      <ResearchAction card={card} />
      {card.markChip !== null && <MarkLadder chip={card.markChip} />}
    </article>
  )
}

function ResearchAction({ card }: { card: NodeCardModel }) {
  const researchNode = useTreeScreenStore((state) => state.researchNode)
  if (card.status === 'researched') return <p className={styles.done}>Researched</p>
  if (card.status !== 'affordable') return <p className={styles.refusal}>{card.refusalText}</p>
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
