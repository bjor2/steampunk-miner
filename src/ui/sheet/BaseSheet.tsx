/**
 * The one base sheet (spec #678, ticket 686; HS: one tabbed base panel, tabs from data): draws the
 * store's open tab in the shared sheet frame at its placement, the bar of every tab shown now, and
 * the tab's own content in the sheet's scroll area. Mounted twice, once over the stage for the
 * phone's full sheet and once in the desktop dock beside it; only the mount whose placement the
 * screen takes ever opens, so one sheet shows. The tab it draws is the store's open one, or the
 * Ledger while the pause menu is on its save page (ticket 688); a full sheet stepped aside for the
 * unlock reveal (ticket 718) shuts as it would close and opens again on its tab. On desktop each
 * tab bearing a place's word wears the brass tag of its key (ticket 768). Presentation only: no
 * command, no log line.
 */
import type { ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { readShownSheetTabIds } from '../../store/screenReads'
import { sheetTabDrawnAt } from '../../store/sheetSlice'
import { sheetTabKeyLabelsOf } from '../../systems/input/keyTags'
import { layoutKindOf } from '../../systems/views/designSystem'
import { sheetTabBarOf, type SheetPlacement } from '../../systems/views/sheetLayout'
import { useHudDensity } from '../hud/useHudDensity'
import { Sheet } from '../kit/Sheet'
import type { SheetTabLabel } from '../kit/SheetTabBar'
import { sheetTabById, type SheetTabHead } from '../registries/sheetTabs'
import { sheetPanelOf } from './kernelSheetPanels'
import { useScreenModel } from '../useScreenModel'
import { SHEET_UI_IDS } from './sheetIds'
import { useSheetPlacement } from './useSheetPlacement'
import { useSheetShutter, type SheetShutter } from './useSheetShutter'

export function BaseSheet({
  at,
  children = null,
}: {
  at: SheetPlacement
  /** What lives only while this mount draws the sheet, closing included (the dock's narrowing). */
  children?: ReactNode
}) {
  const openTabId = useGameStore((state) => sheetTabDrawnAt(state, at))
  const isPlacedHere = useSheetPlacement() === at
  const shutter = useSheetShutter(isPlacedHere ? openTabId : null)
  if (shutter.tabId === null) return null
  return (
    <>
      <ShownBaseSheet placement={at} shutter={shutter} />
      {children}
    </>
  )
}

function ShownBaseSheet({
  placement,
  shutter,
}: {
  placement: SheetPlacement
  shutter: SheetShutter
}) {
  const shownTabIds = useScreenModel(readShownSheetTabIds)
  const openSheet = useGameStore((state) => state.openSheet)
  const closeSheet = useGameStore((state) => state.closeSheet)
  const keyLabels = useTabKeyLabels(shownTabIds)
  return (
    <BaseSheetView
      placement={placement}
      shutter={shutter}
      shownTabIds={shownTabIds}
      keyLabels={keyLabels}
      onSelectTab={openSheet}
      onClose={closeSheet}
    />
  )
}

/** Desktop's brass key tags on the tabs (ticket 768); none on a phone. */
function useTabKeyLabels(shownTabIds: readonly string[]): Readonly<Record<string, string>> {
  const bindings = useGameStore((state) => state.bindings)
  const isDesktop = layoutKindOf(useHudDensity()) === 'desktop'
  return isDesktop ? sheetTabKeyLabelsOf(tabHeadsOf(shownTabIds), bindings) : NO_KEY_LABELS
}

/** The sheet as the store's values draw it: the shutter's tab, else the first shown, in its frame. */
export function BaseSheetView({
  placement,
  shutter,
  shownTabIds,
  keyLabels = NO_KEY_LABELS,
  onSelectTab,
  onClose,
}: {
  placement: SheetPlacement
  shutter: SheetShutter
  shownTabIds: readonly string[]
  /** The brass key tag of each tab by id (ticket 768); none on a phone. */
  keyLabels?: Readonly<Record<string, string>>
  onSelectTab: (tabId: string) => void
  onClose: () => void
}) {
  const tabBar = sheetTabBarOf(shownTabIds, shutter.tabId)
  const activeTab = tabBar.activeTabId === null ? null : sheetTabById(tabBar.activeTabId)
  const ActivePanel = activeTab === null ? null : sheetPanelOf(activeTab.id)
  if (activeTab === null || ActivePanel === null) return null
  return (
    <Sheet
      placement={placement}
      phase={shutter.phase}
      transition={shutter.transition}
      title={activeTab.title}
      tabs={tabLabelsOf(tabBar.tabIds, keyLabels)}
      tabBar={tabBar}
      onSelectTab={onSelectTab}
      onClose={onClose}
      testId={SHEET_UI_IDS.baseSheet}
    >
      <ActivePanel />
    </Sheet>
  )
}

const NO_KEY_LABELS: Readonly<Record<string, string>> = {}

function tabLabelsOf(
  tabIds: readonly string[],
  keyLabels: Readonly<Record<string, string>>,
): SheetTabLabel[] {
  return tabHeadsOf(tabIds).map(({ id, title }) =>
    keyLabels[id] === undefined ? { id, title } : { id, title, keyLabel: keyLabels[id] },
  )
}

function tabHeadsOf(tabIds: readonly string[]): SheetTabHead[] {
  return tabIds.map(sheetTabById).filter(isTab)
}

function isTab(tab: SheetTabHead | null): tab is SheetTabHead {
  return tab !== null
}
