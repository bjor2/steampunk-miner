/**
 * The campaign overview (#161 section 4, zoom 1): every lane as a strip of icons on the planet
 * ruler, so a node's place says when and its lane what kind; dashed combos sit on their own row.
 * Drag or the arrow keys pan it. On a narrow screen it becomes the shown lane's list.
 */
import type { LaneModel, TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { LaneTabs } from './LaneTabs'
import { NodeButton } from './NodeButton'
import { rulerStyleOf, tierStyleOf } from './tierStyle'
import { useDragPan } from './useDragPan'
import styles from './LaneMap.module.css'

export function LaneMap({ model }: { model: TreeScreenModel }) {
  const { ref, ...panHandlers } = useDragPan()
  return (
    <div className={styles.map}>
      <LaneTabs lanes={model.lanes} />
      <div
        ref={ref}
        className={styles.viewport}
        style={rulerStyleOf(model.lastPlanet)}
        tabIndex={0}
        aria-label="Tech tree map: drag or use the arrow keys to pan"
        {...panHandlers}
      >
        <PlanetRuler marks={model.rulerMarks} planetIndex={model.planetIndex} />
        {model.lanes.map((lane) => (
          <LaneStrip key={lane.lane} lane={lane} />
        ))}
      </div>
    </div>
  )
}

function PlanetRuler({ marks, planetIndex }: { marks: readonly number[]; planetIndex: number }) {
  return (
    <div className={styles.ruler}>
      {marks.map((planet) => (
        <span key={planet} className={styles.mark} style={tierStyleOf(planet)}>
          P{planet}
        </span>
      ))}
      <span
        className={styles.here}
        style={tierStyleOf(planetIndex)}
        aria-label={`You are on planet ${planetIndex}`}
      />
    </div>
  )
}

function LaneStrip({ lane }: { lane: LaneModel }) {
  const focusLane = useTreeScreenStore((state) => state.focusLane)
  const isShownTab = useTreeScreenStore((state) => state.lane === lane.lane)
  return (
    <section
      className={styles.lane}
      data-testid={`tech-tree-lane-${lane.lane}`}
      data-shown-tab={isShownTab}
    >
      <button type="button" className={styles.laneTitle} onClick={() => focusLane(lane.lane)}>
        {lane.title}
      </button>
      {lane.isComingSoon ? (
        <p className={styles.comingSoon}>Coming soon</p>
      ) : (
        <div className={styles.strip}>
          {lane.nodes.map((node) => (
            <NodeButton key={node.id} card={node} stack={node.stack} />
          ))}
        </div>
      )}
    </section>
  )
}
