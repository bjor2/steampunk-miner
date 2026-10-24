/**
 * The slice panels in a bay's body, after its own rows (ticket 845, the TD ruling on #821 Q3): each
 * shown row drawn by its kind's view, in order. A phone draws every row and the bay's one scroll
 * area scrolls them; desktop draws a page and turns the pages with Previous and Next
 * (`bayPanelPageOf`). With no row shown it draws nothing, so the bay's markup is as before.
 */
import { useCallback, useState } from 'react'
import { readShownBayPanelIds } from '../../store/screenReads'
import { bayPanelPageOf, type BayPanelPage } from '../../systems/views/bayPanelPages'
import { layoutKindOf, type LayoutKind } from '../../systems/views/designSystem'
import type { BayId } from '../../systems/world/dockBays'
import { useHudDensity } from '../hud/useHudDensity'
import { Button } from '../kit/Button'
import { TitleOneLine } from '../kit/TitleOneLine'
import { bayPanelKindOf, bayPanelRowById } from '../registries/bayPanels'
import { useScreenModel } from '../useScreenModel'
import styles from './BayPanelList.module.css'
import { BAY_PANEL_UI_IDS } from './bayPanelIds'
import { titleOnlyTextOf } from './dockFacts'

export function BayPanelList({ bay }: { bay: BayId }) {
  const readPanelIds = useCallback(() => readShownBayPanelIds(bay), [bay])
  const panelIds = useScreenModel(readPanelIds)
  const layout = layoutKindOf(useHudDensity())
  if (panelIds.length === 0) return null
  return <BayPanelPages panelIds={panelIds} layout={layout} />
}

/** The shown rows on `layout`, the page turned by the pager; exported for the markup spec. */
export function BayPanelPages({
  panelIds,
  layout,
}: {
  panelIds: readonly string[]
  layout: LayoutKind
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const page = bayPanelPageOf(panelIds, layout, pageIndex)
  return (
    <section
      className={styles.list}
      data-testid={BAY_PANEL_UI_IDS.list}
      data-layout={layout}
      data-page={page.pageIndex}
      data-page-count={page.pageCount}
    >
      {page.panelIds.map((panelId) => (
        <BayPanelOf key={panelId} panelId={panelId} />
      ))}
      {page.pageCount > 1 && <BayPanelPager page={page} turnTo={setPageIndex} />}
    </section>
  )
}

function BayPanelOf({ panelId }: { panelId: string }) {
  const row = bayPanelRowById(panelId)
  if (row === null) return null
  const { Panel } = bayPanelKindOf(row.kind)
  return (
    <div className={styles.panel} data-bay-panel-id={panelId}>
      <Panel panelId={panelId} />
    </div>
  )
}

function BayPanelPager({
  page,
  turnTo,
}: {
  page: BayPanelPage
  turnTo: (pageIndex: number) => void
}) {
  const text = titleOnlyTextOf('dock.panels.page', `Page ${page.pageIndex + 1}/${page.pageCount}`)
  return (
    <nav className={styles.pager}>
      <TitleOneLine text={text} level="span" layout="row">
        <Button
          label="Previous"
          testId={BAY_PANEL_UI_IDS.previous}
          onPress={() => turnTo(page.pageIndex - 1)}
        />
        <Button
          label="Next"
          testId={BAY_PANEL_UI_IDS.next}
          onPress={() => turnTo(page.pageIndex + 1)}
        />
      </TitleOneLine>
    </nav>
  )
}
