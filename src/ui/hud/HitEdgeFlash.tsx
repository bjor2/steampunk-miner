/**
 * A side or rear hull hit's red edge flash (spec #678 G&V 2, ticket 720): one strip per screen
 * edge, lit by the screen effects' `edgeFlash` (kicked and faded with the shake by
 * `ScreenFeedback`, so the flashes switch turns it off). The fade changes every frame, so its
 * opacity is written on the elements, never through React. No box and no text, like the warning
 * glow (ticket 685), so it never counts against the HUD's coverage.
 */
import { useEffect, useRef } from 'react'
import { screenEffects } from '../../scene/screenEffectsPresence'
import { HIT_EDGES, type HitEdge } from '../../systems/feedback/hitFrom'
import styles from './HitEdgeFlash.module.css'

type EdgeStrips = Partial<Record<HitEdge, HTMLDivElement | null>>

export function HitEdgeFlash() {
  const strips = useRef<EdgeStrips>({})
  useEffect(() => {
    let frame = 0
    const draw = () => {
      writeEdgeOpacities(strips.current)
      frame = window.requestAnimationFrame(draw)
    }
    draw()
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return (
    <>
      {HIT_EDGES.map((edge) => (
        <div
          key={edge}
          ref={(strip) => {
            strips.current[edge] = strip
          }}
          className={styles.edge}
          data-edge={edge}
          aria-hidden="true"
        />
      ))}
    </>
  )
}

function writeEdgeOpacities(strips: EdgeStrips): void {
  for (const edge of HIT_EDGES) {
    strips[edge]?.style.setProperty('--hit-flash', String(screenEffects.edgeFlash[edge]))
  }
}
