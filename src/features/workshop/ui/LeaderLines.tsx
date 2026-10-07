/**
 * The leader line from each plaque to its part on the car (#180 section 1, GD rule 1): drawn over
 * the showcase, the selected one lit. The ends on the car move every frame with the car, so they
 * are written on the lines' attributes by `useLeaderLines`, never through React. Markup only.
 */
import { useRef } from 'react'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { useWorkshopStore } from '../store/workshopStore'
import styles from './ShowcaseScreen.module.css'
import { useLeaderLines } from './useLeaderLines'

export function LeaderLines() {
  const svg = useRef<SVGSVGElement>(null)
  const selected = useWorkshopStore((now) => now.selected)
  useLeaderLines(svg)
  return (
    <svg ref={svg} className={styles.leaders} aria-hidden>
      {UPGRADE_IDS.map((id) => (
        <line key={id} data-leader={id} data-selected={id === selected || undefined} />
      ))}
    </svg>
  )
}
