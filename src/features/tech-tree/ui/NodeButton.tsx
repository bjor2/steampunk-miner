/**
 * A node on the map, the next-up strip or a lane list: its icon, name and price, a 44 px target
 * (#173) that opens its card. The status is a data attribute the style sheet reads (#158: a red
 * price while the wallet is short, a rivet dot once researched), never a colour in markup.
 */
import type { NodeCardModel } from '../systems/nodeCardModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { NodeIcon } from './NodeIcon'
import { tierStyleOf } from './tierStyle'
import styles from './NodeButton.module.css'

export function NodeButton({ card, stack = 0 }: { card: NodeCardModel; stack?: number }) {
  const selectNode = useTreeScreenStore((state) => state.selectNode)
  return (
    <button
      type="button"
      className={styles.node}
      style={tierStyleOf(card.tier, stack)}
      data-testid={`tech-tree-node-${card.id}`}
      data-status={card.status}
      data-kind={card.kind}
      onClick={() => selectNode(card.id)}
    >
      <NodeIcon card={card} />
      <span className={styles.name}>{card.name}</span>
      <span className={styles.cost}>{card.costText}</span>
    </button>
  )
}
