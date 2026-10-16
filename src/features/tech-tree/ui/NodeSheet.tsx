/**
 * A node's card on a phone (spec #470 "Tech tree", PT-5): a tap on a node opens its card as a sheet
 * along the bottom of the screen, over the map or the list, so where the node sits stays in view.
 * The card is the card zoom's own (`NodeCardView`), its Research button included; Close, a tap on
 * another node, or Back takes it down.
 */
import { Button } from '../../../ui/kit/Button'
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import type { NodeCardModel } from '../systems/nodeCardModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { NodeCardView } from './NodeCardView'
import { TREE_TEST_IDS } from './nodeTestIds'
import styles from './NodeSheet.module.css'

export function NodeSheet({ card }: { card: NodeCardModel }) {
  const closeNodeCard = useTreeScreenStore((state) => state.closeNodeCard)
  return (
    <section className={styles.sheet} data-testid={TREE_TEST_IDS.sheet} aria-label={card.name}>
      <ScrollArea className={styles.scroll}>
        <NodeCardView card={card}>
          <Button label="Close" onPress={closeNodeCard} testId={TREE_TEST_IDS.sheetClose} />
        </NodeCardView>
      </ScrollArea>
    </section>
  )
}
