import { useEffect, useMemo, type RefObject } from 'react'
import { createScreenPlacement, placeAtWorldPoint } from '../projection/screenPlacement'
import { onFrame, type Vec2 } from '../projection/worldToScreen'

/**
 * Keeps the element over `anchor` every rendered frame (#208), through its ref and a CSS
 * transform, with no React state per frame. `anchor` is read each frame, so a presence object the
 * scene moves (the vehicle's) carries the card with it.
 */
export function useWorldPlacement(ref: RefObject<HTMLElement>, anchor: Vec2): void {
  const placement = useMemo(createScreenPlacement, [])
  useEffect(
    () =>
      onFrame(() => {
        if (ref.current !== null) placeAtWorldPoint(ref.current, placement, anchor)
      }),
    [ref, placement, anchor],
  )
}
