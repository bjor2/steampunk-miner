/**
 * The "next up" strip pinned at the top (#161 section 4): each lane's next node to research, as
 * compact chips under one shared Title+OneLine element (spec #422, pass #426).
 */
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import type { NodeCardModel } from '../systems/nodeCardModel'
import { NodeButton } from './NodeButton'
import { nodeChipElementOf } from './nodeElement'
import styles from './NextUpStrip.module.css'

export function NextUpStrip({ cards }: { cards: readonly NodeCardModel[] }) {
  const oneLine = cards.length === 0 ? 'Nothing to research here yet.' : ''
  const text = { id: 'tech-tree.next-up', title: 'Next up', oneLine, tooltipLines: [] }
  return (
    <section className={styles.strip} aria-label="Next up" data-testid="tech-tree-next-up">
      <TitleOneLine text={text} level="span">
        <div className={styles.chips}>
          {cards.map((card) => (
            <NodeButton key={card.id} card={card} element={nodeChipElementOf(card, 'next-up')} />
          ))}
        </div>
      </TitleOneLine>
    </section>
  )
}
