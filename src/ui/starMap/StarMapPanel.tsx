/**
 * The star map's panel (spec #678, ticket 769; G&V: M or a click opens the #757 star map as a side
 * panel): on desktop drawn in the dock beside the view while the star map is open and no docked
 * sheet holds the dock, so the stage narrows and the panel never covers the view or its hazard
 * strip. A sheet opened over it takes the dock, and the map comes back when the sheet shuts. On a
 * phone (ticket 757; #650: both layouts first-class) it is the full sheet over the stage, opened by
 * the touch cluster's star map button, and steps aside for the base sheet the same way. Mounted
 * once per placement, as the base sheet is; only the mount whose placement the screen takes draws.
 * Its chart scrolls both ways, by wheel, trackpad, keys or a finger, so it pans for any number of
 * systems. Presentation only: no command, no log line.
 */
import type { ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { sheetTabDrawnAt } from '../../store/sheetSlice'
import { actionDefOf, ACTION_MAP } from '../../systems/input/actionMap'
import {
  sheetTransitionOf,
  type SheetPlacement,
  type SheetTabBar,
} from '../../systems/views/sheetLayout'
import { Sheet } from '../kit/Sheet'
import { useSheetPlacement } from '../sheet/useSheetPlacement'
import { StarMapChart } from './StarMapChart'
import { STAR_MAP_UI_IDS } from './starMapIds'

const STAR_MAP_TITLE = actionDefOf(ACTION_MAP, 'open_star_map').displayName

/** The panel is one page: no tab bar, only its Close. */
const NO_TABS: SheetTabBar = { tabIds: [], activeTabId: null, isShown: false, isScrolling: false }

export function StarMapPanel({
  at,
  children = null,
}: {
  at: SheetPlacement
  /** What lives only while the panel is drawn (the dock's narrowing). */
  children?: ReactNode
}) {
  const isOpen = useGameStore((state) => state.isStarMapOpen)
  const isPlaceFree = useGameStore((state) => sheetTabDrawnAt(state, at) === null)
  const isPlacedHere = useSheetPlacement() === at
  if (!isOpen || !isPlaceFree || !isPlacedHere) return null
  return (
    <>
      <ShownStarMapPanel placement={at} />
      {children}
    </>
  )
}

function ShownStarMapPanel({ placement }: { placement: SheetPlacement }) {
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const closeStarMap = useGameStore((state) => state.closeStarMap)
  return (
    <Sheet
      placement={placement}
      phase="open"
      transition={sheetTransitionOf(isMotionReduced)}
      title={STAR_MAP_TITLE}
      tabs={[]}
      tabBar={NO_TABS}
      onSelectTab={ignoreTab}
      onClose={closeStarMap}
      testId={STAR_MAP_UI_IDS.starMapPanel}
    >
      <StarMapChart />
    </Sheet>
  )
}

function ignoreTab(): void {}
