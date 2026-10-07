/**
 * The tech tree screen (#165, spec #161 section 4), drawn by the kernel's slice screen slot:
 * the controls, the "next up" strip, then the zoom level's view, the campaign map, one lane's
 * cards or one node's card. Escape or Back closes it. The click that ends a long press on a node
 * is swallowed here, whatever the opened card put under the finger.
 */
import type { ScreenProps } from '../../../ui/registries/screens'
import type { NodeCardModel } from '../systems/nodeCardModel'
import type { TechNodeLane } from '../systems/techNode'
import type { TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore, type TreeZoom } from '../store/treeScreenStore'
import { LaneFocus } from './LaneFocus'
import { forgetHoldOnNewPress, keepMenuOffAfterHold, swallowClickAfterHold } from './nodeCardHold'
import { LaneMap } from './LaneMap'
import { NextUpStrip } from './NextUpStrip'
import { NodeCardView } from './NodeCardView'
import { TreeHeader } from './TreeHeader'
import { useSelectedNodeCard, useTreeEventRefresh, useTreeScreenModel } from './useTreeScreenModel'
import styles from './TechTreeScreen.module.css'

export const TECH_TREE_SCREEN_ID = 'tech-tree.screen'

export function TechTreeScreen({ onDismiss }: ScreenProps) {
  useTreeEventRefresh()
  const model = useTreeScreenModel()
  const card = useSelectedNodeCard()
  const zoom = useTreeScreenStore((state) => state.zoom)
  const lane = useTreeScreenStore((state) => state.lane)
  return <TechTreeScreenView view={{ model, card, zoom, lane }} onDismiss={onDismiss} />
}

/** What the screen draws: the models and where the player has zoomed to. */
export interface TreeScreenView {
  model: TreeScreenModel
  card: NodeCardModel | null
  zoom: TreeZoom
  lane: TechNodeLane
}

export function TechTreeScreenView({
  view,
  onDismiss,
}: {
  view: TreeScreenView
  onDismiss: () => void
}) {
  return (
    <div
      className={styles.screen}
      data-testid="tech-tree-screen"
      data-zoom={view.zoom}
      onPointerDownCapture={forgetHoldOnNewPress}
      onClickCapture={swallowClickAfterHold}
      onContextMenuCapture={keepMenuOffAfterHold}
    >
      <TreeHeader model={view.model} onDismiss={onDismiss} />
      <NextUpStrip cards={view.model.nextUp} />
      <ZoomView view={view} />
    </div>
  )
}

function ZoomView({ view }: { view: TreeScreenView }) {
  if (view.zoom === 'card') return <NodeCardView card={view.card} />
  if (view.zoom === 'lane') return <LaneFocus model={view.model} lane={view.lane} />
  return <LaneMap model={view.model} />
}
