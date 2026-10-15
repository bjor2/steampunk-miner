/**
 * The one brass-plate tooltip (spec #422 ruling 4, build #423): at most `TOOLTIP_LINES_MAX`
 * short lines under the element it describes, opened by a 200 ms hover, by keyboard focus or by
 * a touch hold that fires no action. It is always in the markup, hidden while closed, so
 * assistive tech and the specs read the same text. With no lines it draws its child alone: a
 * tooltip never holds the only copy of what the player needs, so an element without one is whole.
 */
import type { ReactNode } from 'react'
import styles from './Tooltip.module.css'
import { useTooltipOpening } from './useTooltipOpening'

export function Tooltip({
  id,
  lines,
  children,
}: {
  /** The element's id: the plate carries it as `data-tooltip`. */
  id: string
  lines: readonly string[]
  children: ReactNode
}) {
  if (lines.length === 0) return <>{children}</>
  return (
    <LinedTooltip id={id} lines={lines}>
      {children}
    </LinedTooltip>
  )
}

function LinedTooltip({
  id,
  lines,
  children,
}: {
  id: string
  lines: readonly string[]
  children: ReactNode
}) {
  const tooltip = useTooltipOpening()
  return (
    <div className={styles.anchor} {...tooltip.handlers}>
      {children}
      <div role="tooltip" className={styles.plate} hidden={!tooltip.isOpen} data-tooltip={id}>
        {lines.map((line) => (
          <span key={line} className={styles.line}>
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}
