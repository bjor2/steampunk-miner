/**
 * The one steampunk scroll area (spec #422 ruling 3, build #423): a viewport that scrolls by wheel,
 * touch and keyboard as any overflow does, with the browser's scrollbar hidden, a thin brass rail
 * and a riveted thumb laid over its right edge (so nothing shifts when they show), fading out when
 * idle, and edge fades where more content hides. The caller sizes it through `className`.
 */
import type { ReactNode } from 'react'
import styles from './ScrollArea.module.css'
import { useScrollRail } from './useScrollRail'

export function ScrollArea({
  className,
  testId,
  children,
}: {
  /** The caller's size: a height or max-height from its own module. */
  className?: string
  testId?: string
  children: ReactNode
}) {
  const rail = useScrollRail()
  return (
    <div
      ref={rail.frameRef}
      className={classNamesOf(styles.frame, className)}
      data-testid={testId}
      data-scroll-area
    >
      <div ref={rail.viewportRef} className={styles.viewport} onScroll={rail.markScrolled}>
        <div className={styles.content}>{children}</div>
      </div>
      <div className={styles.rail} aria-hidden>
        <div ref={rail.thumbRef} className={styles.thumb} />
      </div>
    </div>
  )
}

function classNamesOf(own: string, callers: string | undefined): string {
  return callers === undefined ? own : `${own} ${callers}`
}
