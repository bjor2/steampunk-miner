/**
 * The forward hazard strip (GD camera lock on #316, ticket 341): a track laid along the drive from
 * near the rig toward the screen's leading edge, its length a fixed share of the screen, with up to
 * 8 pips placed by time to arrival, 0 to 2 s. The sampler writes the pips each frame; this draws
 * them on its own animation frame.
 */
import { useEffect, useRef } from 'react'
import { STRIP_MAX_PIPS } from '../../constants/hazardStrip'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { drawHazardStrip, pipSlotsOf } from './hazardStripDraw'
import styles from './HazardStrip.module.css'

const PIP_SLOTS = Array.from({ length: STRIP_MAX_PIPS }, (_, index) => index)

export function HazardStrip() {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = strip.current
    if (element === null) return
    const slots = pipSlotsOf(element)
    let frame = 0
    const draw = () => {
      drawHazardStrip(element, slots)
      frame = window.requestAnimationFrame(draw)
    }
    draw()
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return (
    <div ref={strip} className={styles.strip} data-testid={UI_IDS.hudHazardStrip} hidden>
      <div className={styles.track}>
        {PIP_SLOTS.map((index) => (
          <span
            key={index}
            className={styles.pip}
            data-slot={index}
            data-testid={UI_ID_TEMPLATES.hudStripPip(index)}
            hidden
          />
        ))}
      </div>
    </div>
  )
}
