/**
 * The lanes as tabs (#161 section 4, mobile): on a narrow or touch screen one lane shows at a
 * time, chosen here; on a wide screen the style sheet hides the tabs and shows every lane.
 */
import type { LaneModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import styles from './LaneTabs.module.css'

export function LaneTabs({ lanes }: { lanes: readonly LaneModel[] }) {
  const shownLane = useTreeScreenStore((state) => state.lane)
  const showLaneTab = useTreeScreenStore((state) => state.showLaneTab)
  return (
    <div className={styles.tabs} role="tablist">
      {lanes.map(({ lane, title }) => (
        <button
          key={lane}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={lane === shownLane}
          onClick={() => showLaneTab(lane)}
        >
          {title}
        </button>
      ))}
    </div>
  )
}
