/**
 * The tech tree screen (#165, spec #161 section 4), drawn by the kernel's slice screen slot:
 * the controls, the "next up" strip, then the zoom level's view, the campaign map, one lane's
 * cards or one node's card, or every node in one list sorted by affordability (#470 PT-5).
 * On a phone either way up (the compact layout) the map is panned and pinched, the "next up"
 * strip gives way to the "Next affordable" button, and a node's card opens as a sheet along the
 * bottom over the map or the list. Escape or Back closes it. The click that ends a long press on
 * a node is swallowed here, whatever the opened card put under the finger.
 */
import type { HudDensity } from '../../../systems/views/screenLayout'
import { useHudDensity } from '../../../ui/hud/useHudDensity'
import type { ScreenProps } from '../../../ui/registries/screens'
import type { NodeCardModel } from '../systems/nodeCardModel'
import type { TechNodeLane } from '../systems/techNode'
import { affordabilityListOf, nextAffordableNodeIdOf } from '../systems/treeList'
import type { TreeScreenModel } from '../systems/treeScreenModel'
import { useTreeScreenStore, type TreeView, type TreeZoom } from '../store/treeScreenStore'
import { LaneFocus } from './LaneFocus'
import { forgetHoldOnNewPress, keepMenuOffAfterHold, swallowClickAfterHold } from './nodeCardHold'
import { LaneMap } from './LaneMap'
import { NextUpStrip } from './NextUpStrip'
import { NodeCardView } from './NodeCardView'
import { NodeSheet } from './NodeSheet'
import { TreeHeader } from './TreeHeader'
import { TreeList } from './TreeList'
import { useSelectedNodeCard, useTreeEventRefresh, useTreeScreenModel } from './useTreeScreenModel'
import styles from './TechTreeScreen.module.css'

export const TECH_TREE_SCREEN_ID = 'tech-tree.screen'

export function TechTreeScreen({ onDismiss }: ScreenProps) {
  useTreeEventRefresh()
  const model = useTreeScreenModel()
  const card = useSelectedNodeCard()
  const zoom = useTreeScreenStore((state) => state.zoom)
  const lane = useTreeScreenStore((state) => state.lane)
  const treeView = useTreeScreenStore((state) => state.treeView)
  const density = useHudDensity()
  const view = { model, card, zoom, lane, treeView, density }
  return <TechTreeScreenView view={view} onDismiss={onDismiss} />
}

/** What the screen draws: the models, where the player has zoomed to and how it is laid out. */
export interface TreeScreenView {
  model: TreeScreenModel
  card: NodeCardModel | null
  zoom: TreeZoom
  lane: TechNodeLane
  /** The map (at the zoom's level) or the list; `map` when left out. */
  treeView?: TreeView
  /** `compact` on a phone either way up; `full` when left out. */
  density?: HudDensity
}

export function TechTreeScreenView({
  view,
  onDismiss,
}: {
  view: TreeScreenView
  onDismiss: () => void
}) {
  const list = affordabilityListOf(view.model)
  const nextAffordableId = nextAffordableNodeIdOf(list, view.card?.id ?? null)
  const density = view.density ?? 'full'
  return (
    <div
      className={styles.screen}
      data-testid="tech-tree-screen"
      data-zoom={view.zoom}
      data-density={density}
      onPointerDownCapture={forgetHoldOnNewPress}
      onClickCapture={swallowClickAfterHold}
      onContextMenuCapture={keepMenuOffAfterHold}
    >
      <TreeHeader
        model={view.model}
        treeView={view.treeView ?? 'map'}
        nextAffordableId={nextAffordableId}
        onDismiss={onDismiss}
      />
      {density === 'compact' ? (
        <CompactBody view={view} list={list} />
      ) : (
        <FullBody view={view} list={list} />
      )}
    </div>
  )
}

/** The "next up" strip over the zoom level's view; the list in place of the map or a lane. */
function FullBody({ view, list }: { view: TreeScreenView; list: readonly NodeCardModel[] }) {
  return (
    <>
      <NextUpStrip cards={view.model.nextUp} />
      <ZoomView view={view} list={list} />
    </>
  )
}

function ZoomView({ view, list }: { view: TreeScreenView; list: readonly NodeCardModel[] }) {
  if (view.zoom === 'card') return <NodeCardView card={view.card} />
  if (view.treeView === 'list') return <TreeList list={list} />
  if (view.zoom === 'lane') return <LaneFocus model={view.model} lane={view.lane} />
  return <LaneMap model={view.model} />
}

/** The map or the list fills the screen; a picked node's card is a sheet over it. */
function CompactBody({ view, list }: { view: TreeScreenView; list: readonly NodeCardModel[] }) {
  return (
    <>
      {view.treeView === 'list' ? <TreeList list={list} /> : <LaneMap model={view.model} />}
      {view.zoom === 'card' && view.card !== null && <NodeSheet card={view.card} />}
    </>
  )
}
