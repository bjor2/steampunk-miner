/**
 * Lane focus (#161 section 4, zoom 2): one lane's nodes as full cards in planet order, with the
 * other lanes a tap away.
 */
import type { TechNodeLane } from '../systems/techNode'
import { shownLaneOf, type TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { NodeButton } from './NodeButton'
import styles from './LaneFocus.module.css'

export function LaneFocus({
  model,
  lane: shownLane,
}: {
  model: TreeScreenModel
  lane: TechNodeLane
}) {
  const focusLane = useTreeScreenStore((state) => state.focusLane)
  const lane = shownLaneOf(model, shownLane)
  return (
    <div className={styles.focus} data-testid={`tech-tree-lane-focus-${lane.lane}`}>
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
      {lane.isComingSoon && <p className={styles.comingSoon}>Coming soon</p>}
      <ol className={styles.cards}>
        {lane.nodes.map((card) => (
          <li key={card.id} className={styles.card}>
            <NodeButton card={card} />
            <span className={styles.tier}>P{card.tier}</span>
            <p className={styles.description}>{card.description}</p>
            {card.markChip !== null && <span className={styles.chip}>{card.markChip.text}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
