/**
 * One card or label on the HUD overlay (#208), drawn over a world point: its top-left corner sits
 * on the point, so the content offsets itself. It holds one of the overlay's seats under its
 * panel's priority and draws nothing once evicted.
 */
import { useContext, useRef, type ReactNode } from 'react'
import type { Vec2 } from '../projection/worldToScreen'
import { OverlayPriorityContext } from './overlayPriority'
import { useOverlaySeat } from './useOverlaySeat'
import { useWorldPlacement } from './useWorldPlacement'
import styles from './Overlay.module.css'

export function OverlayCard({ anchor, children }: { anchor: Vec2; children: ReactNode }) {
  const isSeated = useOverlaySeat(useContext(OverlayPriorityContext))
  const card = useRef<HTMLDivElement>(null)
  useWorldPlacement(card, anchor)
  if (!isSeated) return null
  return (
    <div ref={card} className={styles.card}>
      {children}
    </div>
  )
}
