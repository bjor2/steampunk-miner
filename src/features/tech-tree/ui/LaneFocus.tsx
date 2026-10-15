/**
 * Lane focus (#161 section 4, zoom 2): one lane's nodes as full rows in planet order, with the
 * other lanes a tap away. Each row is the node's shared Title+OneLine element (spec #422, pass
 * #426) and the list scrolls in the shared scroll area.
 */
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import type { TechNodeLane } from '../systems/techNode'
import { shownLaneOf, type LaneModel, type TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { NodeButton } from './NodeButton'
import { nodeRowElementOf } from './nodeElement'
import styles from './LaneFocus.module.css'

export function LaneFocus({
  model,
  lane: shownLane,
}: {
  model: TreeScreenModel
  lane: TechNodeLane
}) {
  const lane = shownLaneOf(model, shownLane)
  return (
    <div className={styles.focus} data-testid={`tech-tree-lane-focus-${lane.lane}`}>
      <LanePicker model={model} lane={lane} />
      <ScrollArea className={styles.list}>
        <ol className={styles.cards}>
          {lane.nodes.map((card) => (
            <li key={card.id} className={styles.card}>
              <NodeButton card={card} element={nodeRowElementOf(card)} />
            </li>
          ))}
        </ol>
      </ScrollArea>
    </div>
  )
}

/** The lane's name and every other lane's button; a lane no slice has filled says so. */
function LanePicker({ model, lane }: { model: TreeScreenModel; lane: LaneModel }) {
  const focusLane = useTreeScreenStore((state) => state.focusLane)
  const oneLine = lane.isComingSoon ? 'Coming soon.' : ''
  const text = { id: 'tech-tree.lane-focus', title: lane.title, oneLine, tooltipLines: [] }
  return (
    <TitleOneLine text={text} level="h3">
      <nav className={styles.picker}>
        {model.lanes.map(({ lane: id, title }) => (
          <button
            key={id}
            type="button"
            className={styles.pick}
            aria-current={id === lane.lane}
            onClick={() => focusLane(id)}
          >
            {title}
          </button>
        ))}
      </nav>
    </TitleOneLine>
  )
}
