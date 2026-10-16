/**
 * A node on the map, the next-up strip or a lane list: its icon and the shared Title+OneLine
 * element the caller maps it to (`nodeElement`, spec #422 pass #426), a 44 px target (#173) that
 * opens its card on a click or a tap, or while a touch is held on it (#161 section 4, mobile). The
 * status is a data attribute the style sheet reads (#158: a red price while the wallet is short, a
 * rivet dot once researched), never a colour in markup.
 */
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import type { NodeCardModel } from '../systems/nodeCardModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import type { NodeElement } from './nodeElement'
import { NodeIcon } from './NodeIcon'
import { nodeTestIdOf } from './nodeTestIds'
import { tierStyleOf } from './tierStyle'
import { useNodeHold } from './useNodeHold'
import styles from './NodeButton.module.css'

export function NodeButton({
  card,
  element,
  stack = 0,
}: {
  card: NodeCardModel
  element: NodeElement
  stack?: number
}) {
  const selectNode = useTreeScreenStore((state) => state.selectNode)
  const holdHandlers = useNodeHold(card.id)
  return (
    <button
      type="button"
      className={styles.node}
      style={tierStyleOf(card.tier, stack)}
      data-testid={nodeTestIdOf(card.id)}
      data-status={card.status}
      data-kind={card.kind}
      onClick={() => selectNode(card.id)}
      {...holdHandlers}
    >
      <NodeIcon card={card} />
      <TitleOneLine
        text={element.text}
        facts={element.facts}
        lockReason={element.lockReason}
        level="span"
      />
    </button>
  )
}
