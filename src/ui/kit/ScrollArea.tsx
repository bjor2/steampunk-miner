/**
 * The one steampunk scroll area (spec #422 ruling 3, build #423): a viewport that scrolls by wheel,
 * touch and keyboard as any overflow does, with the browser's scrollbar hidden, a thin brass rail
 * and a riveted thumb laid over its right edge (so nothing shifts when they show), fading out when
 * idle, and edge fades where more content hides. The caller sizes it through `className`, and may
 * hand the viewport its own attributes and handlers (a map panned by drag or keys, pass #426).
 * Sideways (`axis="x"`, the sheet's tab bar of ticket 686) it scrolls along its width with fades at
 * the side edges and no rail: the baked thumb is upright, and a row of tabs shows its own end.
 */
import type { HTMLAttributes, ReactNode } from 'react'
import styles from './ScrollArea.module.css'
import { useScrollRail, type ScrollAxis } from './useScrollRail'

/** What a caller may put on the viewport; the scroll area keeps its own class and scroll hook. */
export type ScrollViewportProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'className' | 'onScroll'
>

const NO_VIEWPORT_PROPS: ScrollViewportProps = {}

export function ScrollArea({
  className,
  testId,
  axis = 'y',
  viewport = NO_VIEWPORT_PROPS,
  children,
}: {
  /** The caller's size: a height or max-height from its own module. */
  className?: string
  testId?: string
  /** `y` scrolls down a list (the default); `x` scrolls a row sideways. */
  axis?: ScrollAxis
  /** Attributes and handlers for the scrolling element itself, whose scroll position they move. */
  viewport?: ScrollViewportProps
  children: ReactNode
}) {
  const rail = useScrollRail(axis)
  return (
    <div
      ref={rail.frameRef}
      className={classNamesOf(styles.frame, className)}
      data-testid={testId}
      data-scroll-area
      data-axis={axis}
    >
      <div
        {...viewport}
        ref={rail.viewportRef}
        className={styles.viewport}
        onScroll={rail.markScrolled}
      >
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
