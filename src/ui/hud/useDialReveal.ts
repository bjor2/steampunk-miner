/**
 * When a gauge cluster dial shows its number (ticket 716, #684's rule): while a mouse rests on it
 * or after a clean tap on it (`useHudCard`), the next tap hiding it again. On a phone the strip
 * sits in the top keep-out and takes no pointer at all (design-system.md section 9), so there the
 * numbers stay behind the gear. A resting mouse also shows the full value (ticket 768), so the
 * hover is answered on its own too. UI state only, never a command.
 */
import { useHudCard, type HudCardHandlers } from './useHudCard'
import { useMouseHover, type MouseHoverHandlers } from '../kit/useMouseHover'

export type DialRevealHandlers = HudCardHandlers & MouseHoverHandlers

export function useDialReveal(): {
  isRevealed: boolean
  isHovered: boolean
  handlers: DialRevealHandlers
} {
  const card = useHudCard()
  const hover = useMouseHover()
  return {
    isRevealed: card.isOpen || hover.isHovered,
    isHovered: hover.isHovered,
    handlers: { ...card.handlers, ...hover.handlers },
  }
}
