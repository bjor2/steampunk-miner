/**
 * The star map's panel on desktop (spec #678, ticket 769; G&V: M or a click opens the #757 star map
 * as a side panel): drawn in the dock beside the view while the star map is open and no docked
 * sheet holds the dock, so the stage narrows and the panel never covers the view or its hazard
 * strip. A sheet opened over it takes the dock, and the map comes back when the sheet shuts. Its
 * chart scrolls both ways, by wheel, trackpad or keys, so it pans for any number of systems; the
 * map (#757) draws inside the chart. Presentation only: no command, no log line.
 */
import type { ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { sheetTabDrawnAt } from '../../store/sheetSlice'
import { actionDefOf, ACTION_MAP } from '../../systems/input/actionMap'
import { sheetTransitionOf, type SheetTabBar } from '../../systems/views/sheetLayout'
import { Sheet } from '../kit/Sheet'
import { useSheetPlacement } from '../sheet/useSheetPlacement'
import { STAR_MAP_UI_IDS } from './starMapIds'
import styles from './StarMapPanel.module.css'

const STAR_MAP_TITLE = actionDefOf(ACTION_MAP, 'open_star_map').displayName

/** The panel is one page: no tab bar, only its Close. */
const NO_TABS: SheetTabBar = { tabIds: [], activeTabId: null, isShown: false, isScrolling: false }

export function StarMapPanel({
  children = null,
}: {
  /** What lives only while the panel is drawn (the dock's narrowing). */
  children?: ReactNode
}) {
  const isOpen = useGameStore((state) => state.isStarMapOpen)
  const isDockFree = useGameStore((state) => sheetTabDrawnAt(state, 'docked') === null)
  const isDesktopDock = useSheetPlacement() === 'docked'
  if (!isOpen || !isDockFree || !isDesktopDock) return null
  return (
    <>
      <ShownStarMapPanel />
      {children}
    </>
  )
}

function ShownStarMapPanel() {
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const closeStarMap = useGameStore((state) => state.closeStarMap)
  return (
    <Sheet
      placement="docked"
      phase="open"
      transition={sheetTransitionOf(isMotionReduced)}
      title={STAR_MAP_TITLE}
      tabs={[]}
      tabBar={NO_TABS}
      onSelectTab={ignoreTab}
      onClose={closeStarMap}
      testId={STAR_MAP_UI_IDS.starMapPanel}
    >
      <div className={styles.chart} data-testid={STAR_MAP_UI_IDS.starMapChart} />
    </Sheet>
  )
}

function ignoreTab(): void {}
