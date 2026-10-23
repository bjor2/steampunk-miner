/**
 * The sheet's tab bar (spec #678, ticket 686; design-system.md section 10): one brass-edged label
 * per tab, the active one lifted, every tab a 44 px target. The row sits sideways in the shared
 * scroll area, so past what fits (about `layout.tabsMax` tabs, `data-scrolling`) it scrolls with
 * an edge fade rather than shrinking a label. On desktop a tab wears the brass tag of the key that
 * jumps to it (ticket 768).
 */
import { KeyTag } from './KeyTag'
import { ScrollArea } from './ScrollArea'
import styles from './SheetTabBar.module.css'

export interface SheetTabLabel {
  id: string
  title: string
  /** The brass tag of the key that jumps here (ticket 768): desktop only, absent on a phone. */
  keyLabel?: string
}

export function SheetTabBar({
  tabs,
  activeTabId,
  isScrolling,
  onSelectTab,
}: {
  tabs: readonly SheetTabLabel[]
  activeTabId: string | null
  isScrolling: boolean
  onSelectTab: (tabId: string) => void
}) {
  return (
    <ScrollArea axis="x">
      <div
        className={styles.bar}
        role="tablist"
        data-sheet-tabs
        data-scrolling={isScrolling || undefined}
      >
        {tabs.map((tab) => (
          <SheetTabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelectTab={onSelectTab}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

function SheetTabButton({
  tab,
  isActive,
  onSelectTab,
}: {
  tab: SheetTabLabel
  isActive: boolean
  onSelectTab: (tabId: string) => void
}) {
  return (
    <button
      type="button"
      role="tab"
      className={styles.tab}
      aria-selected={isActive}
      data-sheet-tab={tab.id}
      onClick={() => onSelectTab(tab.id)}
    >
      {tab.title}
      {tab.keyLabel !== undefined && <KeyTag label={tab.keyLabel} place="inline" />}
    </button>
  )
}
