/**
 * When a gauge cluster dial shows its number (ticket 716, #684's rule): while a mouse rests on it
 * or after a clean tap on it (`useHudCard`), the next tap hiding it again. On a phone the strip
 * sits in the top keep-out and takes no pointer at all (design-system.md section 9), so there the
 * numbers stay behind the gear. UI state only, never a command.
 */
import { useState, type PointerEvent } from 'react'
import { useHudCard, type HudCardHandlers } from './useHudCard'

export interface DialRevealHandlers extends HudCardHandlers {
  onPointerEnter(event: PointerEvent<HTMLElement>): void
  onPointerLeave(): void
}

export function useDialReveal(): { isRevealed: boolean; handlers: DialRevealHandlers } {
  const card = useHudCard()
  const [isHovered, setIsHovered] = useState(false)
  return {
    isRevealed: card.isOpen || isHovered,
    handlers: {
      ...card.handlers,
      onPointerEnter: (event) => setIsHovered(event.pointerType === 'mouse'),
      onPointerLeave: () => setIsHovered(false),
    },
  }
}
