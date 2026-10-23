/**
 * Whether a mouse rests on an element (ticket 768's desktop hovers; ticket 716's dial reveal): a
 * finger or a pen never hovers, so a phone's markup never changes under a touch. UI state only,
 * never a command: a hover shows, a click acts.
 */
import { useState, type PointerEvent } from 'react'

export interface MouseHoverHandlers {
  onPointerEnter(event: PointerEvent<HTMLElement>): void
  onPointerLeave(): void
}

export function useMouseHover(): { isHovered: boolean; handlers: MouseHoverHandlers } {
  const [isHovered, setIsHovered] = useState(false)
  return {
    isHovered,
    handlers: {
      onPointerEnter: (event) => setIsHovered(event.pointerType === 'mouse'),
      onPointerLeave: () => setIsHovered(false),
    },
  }
}
