/**
 * The count badges of option B's merged pops (ticket 616): a fixed set of badges laid over the
 * canvas, each placed every frame over a pop that holds more than its own cell. Drawn before the
 * HUD's other slots, so the banner, the threat markers, the prompts and the hazard strip draw
 * over it, and a badge never covers the collapse warning or the strip.
 */
import { useEffect, useMemo, useRef } from 'react'
import { POP_BADGES_MOST } from '../../constants/materialPop'
import { onFrame } from '../projection/worldToScreen'
import { createPopBadgeBoard, placePopBadges } from './popBadgePlacement'
import styles from './PopBadges.module.css'

const BADGE_SLOTS = Array.from({ length: POP_BADGES_MOST }, (_, at) => at)

export function PopBadges() {
  const elements = useRef<(HTMLSpanElement | null)[]>([])
  const board = useMemo(() => createPopBadgeBoard(POP_BADGES_MOST), [])
  useEffect(() => onFrame(() => placePopBadges(elements.current, board)), [board])
  return (
    <div className={styles.layer} aria-hidden="true">
      {BADGE_SLOTS.map((at) => (
        <span
          key={at}
          ref={(element) => {
            elements.current[at] = element
          }}
          className={styles.badge}
          data-testid="material-pop-badge"
        />
      ))}
    </div>
  )
}
