import { useRef, type PointerEvent } from 'react'
import { aimFireTile, cancelFireTile, pressFireTile, releaseFireTile } from '../store/fireInput'
import { isDragAiming, rigAimOfDrag, type PlaneVector } from '../systems/render/aimOnScreen'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'
import { rigOnScreen } from './rigOnScreen'

export interface FireTilePointer {
  onPointerDown(event: PointerEvent<HTMLElement>): void
  onPointerMove(event: PointerEvent<HTMLElement>): void
  onPointerUp(): void
  onPointerCancel(): void
}

/**
 * A finger on the fire tile: the press, a drag that aims once it passes the tile's aim distance,
 * and the release. The pointer is captured, so a drag may leave the tile and still aim.
 */
export function useFireTilePointer(): FireTilePointer {
  const start = useRef<PlaneVector | null>(null)
  return {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      start.current = { x: event.clientX, y: event.clientY }
      pressFireTile()
    },
    onPointerMove: (event) => aimAlongDrag(start.current, event),
    onPointerUp: () => {
      start.current = null
      releaseFireTile()
    },
    onPointerCancel: () => {
      start.current = null
      cancelFireTile()
    },
  }
}

function aimAlongDrag(start: PlaneVector | null, event: PointerEvent<HTMLElement>): void {
  if (start === null) return
  const drag = { x: event.clientX - start.x, y: event.clientY - start.y }
  const rig = rigOnScreen()
  if (rig === null || !isDragAiming(drag, FIRE_TILE_FEEL.dragAimPixels)) return
  aimFireTile(rigAimOfDrag(drag, rig.right, rig.up))
}
