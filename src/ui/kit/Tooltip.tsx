/**
 * The one brass-plate tooltip (spec #422 ruling 4, build #423): at most `TOOLTIP_LINES_MAX`
 * short lines under the element it describes, opened by a 200 ms hover, by keyboard focus or by
 * a touch hold that fires no action. It is always in the markup, hidden while closed, so
 * assistive tech and the specs read the same text. With no lines it draws its child alone: a
 * tooltip never holds the only copy of what the player needs, so an element without one is whole.
 * `isHeldOpen` is the game's own menu focus (a pad or the keys), which opens it as focus does.
 */
import type { ReactNode } from 'react'
import styles from './Tooltip.module.css'
import { useTooltipOpening } from './useTooltipOpening'

export function Tooltip({
  id,
  lines,
  isHeldOpen = false,
  children,
}: {
  /** The element's id: the plate carries it as `data-tooltip`. */
  id: string
  lines: readonly string[]
  isHeldOpen?: boolean
  children: ReactNode
}) {
  if (lines.length === 0) return <>{children}</>
  return (
    <LinedTooltip id={id} lines={lines} isHeldOpen={isHeldOpen}>
      {children}
    </LinedTooltip>
  )
}

function LinedTooltip({
  id,
  lines,
  isHeldOpen,
  children,
}: {
  id: string
  lines: readonly string[]
  isHeldOpen: boolean
  children: ReactNode
}) {
  const tooltip = useTooltipOpening()
  const isShown = tooltip.isOpen || isHeldOpen
  return (
    <div className={styles.anchor} {...tooltip.handlers}>
      {children}
      <div role="tooltip" className={styles.plate} hidden={!isShown} data-tooltip={id}>
        {lines.map((line) => (
          <span key={line} className={styles.line}>
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}
