/**
 * Every node the search and filters keep, as one list in the order the wallet reaches them
 * (spec #470 "Tech tree", PT-5; `treeList`): what can be researched now, cheapest first, then what
 * only money stands in the way of, then the locked, then the researched. Each row is the node's
 * whole element (its place on the ruler, its price or what it needs), a 48 px target that opens
 * its card on a tap. It scrolls in the shared scroll area.
 */
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import type { NodeCardModel } from '../systems/nodeCardModel'
import { NodeButton } from './NodeButton'
import { nodeRowElementOf } from './nodeElement'
import { TREE_TEST_IDS } from './nodeTestIds'
import styles from './TreeList.module.css'

const EMPTY_TEXT = {
  id: 'tech-tree.list.none',
  title: 'No nodes',
  oneLine: 'Nothing matches the search and filters.',
  tooltipLines: [],
}

export function TreeList({ list }: { list: readonly NodeCardModel[] }) {
  return (
    <ScrollArea className={styles.list} testId={TREE_TEST_IDS.list}>
      {list.length === 0 && <TitleOneLine text={EMPTY_TEXT} level="span" />}
      <ol className={styles.rows}>
        {list.map((card) => (
          <li key={card.id} className={styles.row}>
            <NodeButton card={card} element={nodeRowElementOf(card)} />
          </li>
        ))}
      </ol>
    </ScrollArea>
  )
}
