/**
 * The floating stick (#173): it appears where the thumb lands in the zone, and its knob follows the
 * thumb inside the 56 px travel. Where it landed is UI state; the knob moves on a ref, not React.
 */
import { useRef, useState, type PointerEvent } from 'react'
import { knobOffsetOf } from '../../systems/input/touchControls'
import { landStick, liftStick, pushStick, stickPresence } from '../../store/touchRuntime'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import styles from './TouchControls.module.css'

interface StickSpot {
  left: number
  top: number
}

export function StickZone() {
  const [spot, setSpot] = useState<StickSpot | null>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  return (
    <div
      className={styles.stickZone}
      data-testid={DEVICE_UI_IDS.touchStickZone}
      onPointerDown={(event) => setSpot(landStickAt(event))}
      onPointerMove={(event) => pushStickTo(event, knobRef.current)}
      onPointerUp={(event) => setSpot(liftStickOf(event))}
      onPointerCancel={(event) => setSpot(liftStickOf(event))}
    >
      {spot !== null && (
        <div className={styles.stickBase} style={spot} data-testid={DEVICE_UI_IDS.touchStick}>
          <div className={styles.knob} ref={knobRef} />
        </div>
      )}
    </div>
  )
}

function landStickAt(event: PointerEvent<HTMLDivElement>): StickSpot | null {
  if (stickPresence.pointerId !== null) return spotOfStick(event.currentTarget)
  event.currentTarget.setPointerCapture(event.pointerId)
  landStick(event.pointerId, event.clientX, event.clientY)
  return spotOfStick(event.currentTarget)
}

function pushStickTo(event: PointerEvent<HTMLDivElement>, knob: HTMLDivElement | null): void {
  pushStick(event.pointerId, event.clientX, event.clientY)
  const { dx, dy } = knobOffsetOf(stickPresence.offset)
  knob?.style.setProperty('--knob-x', `${dx}px`)
  knob?.style.setProperty('--knob-y', `${dy}px`)
}

function liftStickOf(event: PointerEvent<HTMLDivElement>): StickSpot | null {
  liftStick(event.pointerId)
  return stickPresence.pointerId === null ? null : spotOfStick(event.currentTarget)
}

/** The landing point in the zone's own coordinates. */
function spotOfStick(zone: HTMLDivElement): StickSpot {
  const box = zone.getBoundingClientRect()
  return { left: stickPresence.originX - box.left, top: stickPresence.originY - box.top }
}
