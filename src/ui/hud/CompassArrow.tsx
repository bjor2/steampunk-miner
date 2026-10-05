/**
 * The dock arrow: the model's local-frame octant, turned by how the camera shows local up this
 * frame. The turn changes every frame, so it is written on the element, never through React.
 */
import { useEffect, useRef } from 'react'
import { cameraPresence } from '../../scene/cameraPresence'
import styles from './Hud.module.css'

const DEGREES_PER_OCTANT = 45
const DEGREES_PER_RADIAN = 180 / Math.PI

export function CompassArrow({ octant }: { octant: number }) {
  const arrow = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let frame = 0
    const turn = () => {
      arrow.current?.style.setProperty('--arrow-turn', `${arrowDegrees(octant)}deg`)
      frame = window.requestAnimationFrame(turn)
    }
    turn()
    return () => window.cancelAnimationFrame(frame)
  }, [octant])
  return (
    <span ref={arrow} className={styles.arrow} aria-hidden>
      ↑
    </span>
  )
}

/** Clockwise on screen: the octant in the vehicle frame, less local up's counter-clockwise turn. */
function arrowDegrees(octant: number): number {
  return octant * DEGREES_PER_OCTANT - cameraPresence.localUpScreenAngle * DEGREES_PER_RADIAN
}
