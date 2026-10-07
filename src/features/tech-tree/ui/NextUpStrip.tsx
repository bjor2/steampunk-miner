/** The "next up" strip pinned at the top (#161 section 4): each lane's next node to research. */
import type { NodeCardModel } from '../systems/nodeCardModel'
import { NodeButton } from './NodeButton'
import styles from './NextUpStrip.module.css'

export function NextUpStrip({ cards }: { cards: readonly NodeCardModel[] }) {
  return (
    <section className={styles.strip} aria-label="Next up" data-testid="tech-tree-next-up">
      <span className={styles.title}>Next up</span>
      {cards.length === 0 && <span className={styles.none}>Nothing to research here yet</span>}
      {cards.map((card) => (
        <NodeButton key={card.id} card={card} />
      ))}
    </section>
  )
}
