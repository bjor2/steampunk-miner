/**
 * The aim reticle (ticket 314, #309 aim amendment): while a finger drags the fire tile, a brass
 * line runs from the rig along the bearing the shot will really take, snapped out of the shaft
 * cone, as far as the gun reaches. Drawn on the HUD overlay from the kernel's projection, placed
 * on its ref every frame, never through React state; no scene draw call, so the scene layers'
 * budget is untouched.
 */
import { useEffect, useRef } from 'react'
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { onFrame, project } from '../../../ui/projection/worldToScreen'
import { readAimBearing } from '../store/fireInput'
import { readGunReachCells } from '../store/fireTileReads'
import { reticleEndOf } from '../systems/render/aimOnScreen'
import styles from './FireReticle.module.css'

export function FireReticle() {
  const line = useRef<SVGLineElement>(null)
  useEffect(() => onFrame(() => placeReticle(line.current)), [])
  return (
    <svg className={styles.reticle} aria-hidden>
      <line ref={line} className={styles.line} visibility="hidden" />
    </svg>
  )
}

interface ScreenLine {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

function placeReticle(line: SVGLineElement | null): void {
  if (line === null) return
  const ends = reticleOnScreen()
  if (ends === null) line.setAttribute('visibility', 'hidden')
  else drawLine(line, ends)
}

/** The reticle's two ends in canvas pixels, or null when nothing aims or it is off screen. */
function reticleOnScreen(): ScreenLine | null {
  const bearing = readAimBearing()
  if (bearing === null) return null
  const start = copyOf(project(vehiclePresence))
  const reach = readGunReachCells()
  const end = project(reticleEndOf(vehiclePresence, drillPresence.up, bearing, reach))
  return start === null || end === null ? null : { start, end }
}

function drawLine(line: SVGLineElement, { start, end }: ScreenLine): void {
  line.setAttribute('x1', String(start.x))
  line.setAttribute('y1', String(start.y))
  line.setAttribute('x2', String(end.x))
  line.setAttribute('y2', String(end.y))
  line.setAttribute('visibility', 'visible')
}

/** `project` hands back one shared point, so the start is copied before the end is asked. */
function copyOf(point: { x: number; y: number } | null) {
  return point === null ? null : { x: point.x, y: point.y }
}
