/**
 * The campaign overview (#161 section 4, zoom 1): every lane as a strip of icons on the planet
 * ruler, so a node's place says when and its lane what kind; dashed combos sit on their own row,
 * and the Armoury group's weapon lanes under its heading.
 * Drag or the arrow keys pan it and two fingers pinch it (#470 PT-5), inside the shared scroll
 * area (spec #422, pass #426); the ruler, each lane and the group heading are shared Title+OneLine
 * elements. On a narrow or touch screen it becomes the shown lane's list, but a phone either way up
 * keeps the whole map to pan and pinch, and a node picked off screen is brought into view.
 */
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import type { LaneModel, TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { LaneTabs } from './LaneTabs'
import { NodeButton } from './NodeButton'
import { nodeChipElementOf } from './nodeElement'
import { rulerStyleOf, tierStyleOf } from './tierStyle'
import { TREE_TEST_IDS } from './nodeTestIds'
import { useMapGestures } from './useMapGestures'
import { usePickedNodeInView } from './usePickedNodeInView'
import styles from './LaneMap.module.css'

const RULER_TEXT = { id: 'tech-tree.ruler', title: 'Planets', oneLine: '', tooltipLines: [] }

export function LaneMap({ model }: { model: TreeScreenModel }) {
  const gestureHandlers = useMapGestures()
  const map = usePickedNodeInView()
  return (
    <div ref={map} className={styles.map} style={rulerStyleOf(model.lastPlanet)}>
      <LaneTabs lanes={model.lanes} />
      <ScrollArea
        className={styles.viewport}
        testId={TREE_TEST_IDS.map}
        viewport={{
          tabIndex: 0,
          'aria-label': 'Tech tree map: drag, pinch or use the arrow keys to move it',
          ...gestureHandlers,
        }}
      >
        <div className={styles.zoomed}>
          <PlanetRuler marks={model.rulerMarks} planetIndex={model.planetIndex} />
          {model.lanes.map((lane) => (
            <LaneStrip key={lane.lane} lane={lane} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function PlanetRuler({ marks, planetIndex }: { marks: readonly number[]; planetIndex: number }) {
  return (
    <div className={styles.rulerRow}>
      <TitleOneLine text={RULER_TEXT} level="span">
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
      </TitleOneLine>
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
      {lane.groupHeading !== null && <GroupHeading heading={lane.groupHeading} />}
      <button type="button" className={styles.laneTitle} onClick={() => focusLane(lane.lane)}>
        <TitleOneLine text={laneTextOf(lane)} level="span" />
      </button>
      {!lane.isComingSoon && (
        <div className={styles.strip}>
          {lane.nodes.map((node) => (
            <NodeButton
              key={node.id}
              card={node}
              element={nodeChipElementOf(node, 'map')}
              stack={node.stack}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function GroupHeading({ heading }: { heading: string }) {
  const text = { id: `tech-tree.group.${heading}`, title: heading, oneLine: '', tooltipLines: [] }
  return (
    <div className={styles.groupHeading}>
      <TitleOneLine text={text} level="h3" />
    </div>
  )
}

/** A lane no slice has filled yet says so as its one line. */
function laneTextOf(lane: LaneModel) {
  const oneLine = lane.isComingSoon ? 'Coming soon.' : ''
  return { id: `tech-tree.lane-title.${lane.lane}`, title: lane.title, oneLine, tooltipLines: [] }
}
