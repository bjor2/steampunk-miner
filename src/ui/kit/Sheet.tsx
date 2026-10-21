/**
 * The shared sheet's frame (spec #678, ticket 686; design-system.md sections 9 and 10): the title
 * of the tab it shows, one steampunk scroll area for the tab's content, and the tab bar with the
 * Close button. On a phone it fills the screen and slides up from the foot, with the tabs and
 * Close in the thumb zone and nothing to tap in the top 15%; docked on desktop it slides in from
 * the right beside the play view, the controls under its title. The shutter takes the sheet
 * duration (200 ms) and fades under Reduce Motion; a closing sheet takes no input. Markup only:
 * the base sheet hands it the store's state.
 */
import type { CSSProperties, ReactNode } from 'react'
import type {
  SheetPlacement,
  SheetTabBar as TabBarModel,
  SheetTransition,
} from '../../systems/views/sheetLayout'
import { ScrollArea } from './ScrollArea'
import styles from './Sheet.module.css'
import { SheetTabBar, type SheetTabLabel } from './SheetTabBar'

/** Where the shutter is: sliding in, at rest, or sliding out with the last tab still drawn. */
export type SheetPhase = 'opening' | 'open' | 'closing'

export function Sheet({
  placement,
  phase,
  transition,
  title,
  tabs,
  tabBar,
  onSelectTab,
  onClose,
  testId,
  children,
}: {
  placement: SheetPlacement
  phase: SheetPhase
  transition: SheetTransition
  title: string
  tabs: readonly SheetTabLabel[]
  tabBar: TabBarModel
  onSelectTab: (tabId: string) => void
  onClose: () => void
  testId?: string
  children: ReactNode
}) {
  return (
    <section
      className={styles.sheet}
      style={motionStyleOf(transition)}
      aria-label={title}
      aria-hidden={phase === 'closing' || undefined}
      data-testid={testId}
      data-sheet
      data-placement={placement}
      data-transition={phase}
      data-transition-kind={transition.kind}
    >
      <h2 className={styles.title}>{title}</h2>
      <ScrollArea className={styles.body}>{children}</ScrollArea>
      <div className={styles.controls}>
        {tabBar.isShown && (
          <SheetTabBar
            tabs={tabs}
            activeTabId={tabBar.activeTabId}
            isScrolling={tabBar.isScrolling}
            onSelectTab={onSelectTab}
          />
        )}
        <button type="button" className={styles.close} data-sheet-close onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}

/** The shutter's length, and the cards' fold: none under Reduce Motion, so only the fade shows. */
function motionStyleOf(transition: SheetTransition): CSSProperties {
  const fold = transition.kind === 'fade' ? '0ms' : 'var(--motion-quick)'
  return { '--sheet-shutter': `${transition.ms}ms`, '--sheet-fold': fold } as CSSProperties
}
