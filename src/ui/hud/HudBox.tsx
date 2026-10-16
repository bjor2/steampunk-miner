/**
 * One box of the HUD (#500): its root carries `data-hud`, and on the compact HUD a clean tap on it
 * opens its card, the same box drawn with its words, until the next tap. The box's content picks
 * where its titles show from `titlePlace`: in the card while the compact box is closed.
 */
import type { ReactNode } from 'react'
import type { UiTextTitlePlace } from '../../systems/views/uiText'
import type { HudDensity } from '../../systems/views/screenLayout'
import { hudBoxOf, type HudBoxId } from './hudBoxes'
import { useHudCard } from './useHudCard'

export function HudBox({
  id,
  className,
  density,
  children,
}: {
  id: HudBoxId
  className: string
  density: HudDensity
  children: (titlePlace: UiTextTitlePlace) => ReactNode
}) {
  const card = useHudCard()
  const isCompact = density === 'compact'
  const isCardOpen = isCompact && card.isOpen
  return (
    <div
      className={className}
      {...hudBoxOf(id)}
      data-card-open={isCardOpen || undefined}
      {...(isCompact ? card.handlers : NO_HANDLERS)}
    >
      {children(isCompact && !isCardOpen ? 'card' : 'element')}
    </div>
  )
}

const NO_HANDLERS = {}
